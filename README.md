# Dada - Personal AI Assistant

Voice-enabled AI assistant engineered by **Pratham Dada**, BCA student at **IGNOU**.

## Structure
```
dada/
  api/chat.js           Serverless backend (holds the API key, sanitizes input)
  lib/systemPrompt.js   Dada's system prompt (server-side only)
  public/index.html     UI
  public/styles.css     Cyber/Jarvis theme
  public/app.js         Voice, chat, code preview
  vercel.json           Hosting config + security headers
  package.json  .gitignore  .env.example
```

## Deploy with no terminal (GitHub website + Vercel)

### A. Put the code on GitHub
1. Sign in at github.com, click **+** (top right) > **New repository**. Name it `dada`, keep it **Private**, click **Create repository**.
2. On the empty repo page click **uploading an existing file**.
3. Unzip `dada.zip` on your computer, open the `dada` folder, select **everything inside it** (the `api`, `lib`, `public` folders and the loose files) and drag it into the GitHub page. Folders keep their structure when dragged.
4. Confirm `api/chat.js`, `public/index.html` etc. appear in the list, then click **Commit changes**.
   (`.gitignore` and `.env.example` start with a dot and may be hidden in your file manager. If so, use **Add file > Create new file** on GitHub, type the name, and paste the contents.)

### B. Deploy on Vercel
1. Go to vercel.com, **Sign Up with GitHub**.
2. **Add New > Project**, find `dada`, click **Import**.
3. Leave Framework as **Other**. Open **Environment Variables** and add:
   - Name `ANTHROPIC_API_KEY`, Value: your key from console.anthropic.com
   - (optional) Name `DADA_MODEL`, Value: a model name of your choice
4. Click **Deploy**. In about a minute you get a link like `dada-xyz.vercel.app`.
5. Open it in **Chrome or Edge**, allow the microphone, and start talking.

To update later: edit a file on GitHub (pencil icon) > Commit. Vercel redeploys automatically.

### Notes
- The key lives only in Vercel's environment settings. It never reaches the browser or GitHub.
- Voice uses the browser's built-in Web Speech API, so wake word works only while the tab is open. Chrome sends audio to Google for recognition.
- The rate limit is per server instance; for heavy public use add a shared store (e.g. Upstash Redis).
- Render/Netlify need the backend adapted to their function formats; Vercel works as-is.
