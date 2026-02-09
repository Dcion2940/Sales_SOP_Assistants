# Browser-Based Tasks for Atlas AI Agent

Since you are operating in a browser environment, please help me with the Cloud Infrastructure setup and Verification. All command-line implementation will be done by me locally.

## 1. Google Cloud Project Setup (Console)
**Action**: Navigate to `https://console.cloud.google.com`
**Task**:
1.  **Create Project**: Check if a project named "globaldept-sop" exists. If not, create it.
2.  **Enable APIs**: Go to "APIs & Services" -> "Library" and ensure the following are ENABLED:
    -   **Cloud Run Admin API**
    -   **Cloud Build API**
    -   **Artifact Registry API**
    -   **Google Cloud Storage JSON API**
    -   **Google Firestore API**
    -   **Generative Language API** (or Vertex AI API depending on provider)

## 2. Persistence Layer Setup (Console)
**Action**: Stay in Google Cloud Console.
**Task**:
1.  **Firestore**:
    -   Go to "Firestore".
    -   Create a database in **Native Mode** (Location: `asia-east1` or `us-central1`).
    -   Create a collection named `sops_versions` (just to initialize it).
2.  **Cloud Storage**:
    -   Go to "Cloud Storage".
    -   Create a bucket named `globaldept-sop-uploads`.
    -   **Important**: Check the "Permissions" tab. Ensure the Service Account that Cloud Run will use (usually `default-compute`) has "Storage Object Admin" role.

## 3. Generate Deployment Configuration
**Action**: Code/Script Generation.
**Task**:
-   I need to deploy my local Docker container to Cloud Run.
-   Please **generate the exact `gcloud` command** I should run in my local terminal to:
    1.  Build the image from my current directory (`server/`).
    2.  Deploy to Cloud Run (allow unauthenticated).
    3.  Set environment variables: `GCS_BUCKET_NAME`, `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`.

## 4. End-to-End Verification (Once deployed)
**Action**: Navigate to the App URL (I will provide it).
**Task**:
1.  **Chat Test**: Go to the app URL. Type "How to handle shipping documents?". Verify if the bot responds.
2.  **Upload Test**: (If possible) Try to upload a dummy text file or image in the "Admin" section to see if it processes without errors.
