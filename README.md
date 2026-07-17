# Guidr

Guidr reviews suspicious messages, screenshots, and PDFs using OpenAI's Responses API.

## Configure OpenAI

1. Copy `.env.example` to `.env.local`.
2. Add a server-side `OPENAI_API_KEY`.
3. Optionally set `OPENAI_MODEL` to a vision-capable model enabled for the project.
4. Run `npm run dev` and open `/scan`.

The API key is read only by server routes. Attachments are sent to the model only for the active scan request; Responses API storage is disabled for those requests.
