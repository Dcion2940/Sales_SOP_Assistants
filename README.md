<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1AZ5XVb18Ydea9TIv-Qq-TGnIq1Desfyf

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deployment

This project is configured to deploy automatically to GitHub Pages using GitHub Actions.

**GitHub Pages URL:** https://Dcion2940.github.io/Sales_SOP_Assistants/

### Manual Build & Preview
To test the production build locally:

1. Build the project:
   `npm run build`
2. Preview the build:
   `npm run preview`

### GitHub Settings
To ensure deployment works:
1. Go to your repository **Settings** -> **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push changes to the `main` branch. The action will run automatically.
