# Deploying Tailex to Google Cloud Run

Tailex ships as **one container** (`Dockerfile`): it serves the API and the built web app on the same origin. Cloud Run runs it, scales it to zero when nobody uses it, and gives it an https address. Nothing is stored, so there is no database to set up.

> **You run these commands, not Claude.** They use your Google account and billing. Replace the `UPPER_CASE` words. Never paste a Gemini key anywhere here: visitors bring their own key in the browser.

## 0. Before you start (once)

1. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) and sign in:

```powershell
gcloud auth login
```

2. Pick or create a project and select it. Billing must be enabled on it (Cloud Run has a free tier, but it needs a billing account):

```powershell
gcloud projects create YOUR_PROJECT_ID
```

```powershell
gcloud config set project YOUR_PROJECT_ID
```

3. Turn on the services Cloud Run needs to build from source:

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

4. **Set a budget alert first** (Console → Billing → Budgets & alerts, for example 5 USD with e-mail at 50 % and 100 %). A public app can be abused; the limits below plus the alert keep the cost bounded.

## 1. Check the image on your own computer

```powershell
npm run image:build
```

```powershell
npm run image:run
```

Open http://localhost:8081, try the sample resume, then stop it with Ctrl+C.

## 2. Deploy

From the repository root. Cloud Build uses the `Dockerfile`:

```powershell
gcloud run deploy tailex --source . --region YOUR_REGION --allow-unauthenticated --max-instances 2 --min-instances 0 --concurrency 4 --cpu 1 --memory 1Gi --timeout 60 --port 8080
```

What each flag is for (ADR-043):

| Flag                      | Why                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--max-instances 2`       | Caps the cost: at most two containers, however many visitors.                                          |
| `--min-instances 0`       | Scale to zero: no cost while nobody uses it. The first visit after a quiet period takes a few seconds. |
| `--concurrency 4`         | A PDF build uses CPU. Few requests per container keeps each one fast.                                  |
| `--memory 1Gi`, `--cpu 1` | pdflatex plus Node with headroom. (512 Mi is tight for a build; 1 Gi is safe.)                         |
| `--timeout 60`            | A request is cut off after a minute (a build is limited to 10 s anyway).                               |
| `--allow-unauthenticated` | It is a public website. There are no accounts. The rate limits protect it.                             |

`NODE_ENV=production` is already set in the image. Cloud Run sets `PORT`.

## 3. Check the live site

The deploy prints the address (`https://tailex-….run.app`). Check:

```powershell
curl.exe -s https://YOUR_URL/api/health
```

```powershell
curl.exe -sI https://YOUR_URL/
```

You should see `{"ok":true}`, and in the headers a `Content-Security-Policy` that ends with `upgrade-insecure-requests` and a `Strict-Transport-Security`. Then open the address in a browser, press "Try with a sample resume" and go all the way to the download. Finally try your own resume with **your own** key.

## 4. Day to day

- **Update:** run the same `gcloud run deploy` command again.
- **See logs:** Console → Cloud Run → tailex → Logs. They hold method, path, status and time only, never content or keys.
- **Stop it:** `gcloud run services delete tailex --region YOUR_REGION`.
- **Rate limits** are per visitor and per instance: see SECURITY.md T10. If real users hit them, raise the numbers in `apps/server/src/middleware/rate-limit.ts` and redeploy.
