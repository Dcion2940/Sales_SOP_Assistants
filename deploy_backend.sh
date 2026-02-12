#!/bin/bash

# Configuration
SERVICE_NAME="sop-backend"
REGION="asia-east1" # Change to your preferred region (e.g., us-central1)

# Check if .env exists
if [ ! -f "server/.env" ]; then
    echo "❌ Error: server/.env file missing!"
    echo "Please copy server/.env.example to server/.env and fill in your credentials."
    exit 1
fi

# Load Environment Variables from .env
export $(grep -v '^#' server/.env | xargs)

if [ -z "$GCP_PROJECT_ID" ]; then
    echo "❌ Error: GCP_PROJECT_ID is not set in server/.env"
    exit 1
fi

echo "🚀 Deploying $SERVICE_NAME to Google Cloud Run..."
echo "Project: $GCP_PROJECT_ID"
echo "Region: $REGION"

# 1. Build and Push Image
echo "🔨 Building Docker Image..."
cd server
gcloud builds submit --tag gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check your gcloud configuration."
    exit 1
fi

# 2. Deploy to Cloud Run
echo "☁️ Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GCS_BUCKET_NAME=$GCS_BUCKET_NAME \
  --set-env-vars GEMINI_API_KEY=$GEMINI_API_KEY \
  --set-env-vars LLM_PROVIDER=$LLM_PROVIDER \
  --set-env-vars CHAT_MODEL=$CHAT_MODEL \
  --set-env-vars PARSE_MODEL=$PARSE_MODEL \
  --set-env-vars SIGNED_URL_TTL_SECONDS=$SIGNED_URL_TTL_SECONDS \
  --set-env-vars "SYSTEM_INSTRUCTION=$SYSTEM_INSTRUCTION"

if [ $? -eq 0 ]; then
    echo "✅ Backend Deployed Successfully!"
    echo "Now update your frontend .env (VITE_API_BASE (or VITE_API_BASE_URL)) with the Service URL provided above."
else
    echo "❌ Deployment failed."
fi
