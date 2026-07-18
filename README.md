# Guidr

Guidr reviews suspicious messages, screenshots, and PDFs through two independent AI lanes while preserving the existing queue, streaming UI, case history, and report flow.

1. **GPT-5.6 Terra** reads the supplied text, screenshot, or PDF and produces the primary structured assessment.
2. **Databricks** masks phone and bank-account identifiers locally, runs MaLLaM language normalization, grounds the assessment with AI Search patterns, and returns an independent risk score.
3. Deterministic application code reconciles both opinions into the existing Guidr verdict contract.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Set `OPENAI_API_KEY` for GPT-5.6 Terra. This is required for live screenshot/PDF parsing and consumes OpenAI API usage.
3. Set `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and `DATABRICKS_ENDPOINT_NAME` for the independent Malaysian intelligence lane.
4. Set a random `SCAN_QUEUE_SECRET` outside local development.
5. Run `npm install`, `npm test`, then `npm run dev` and open `/scan`.

With only one provider configured, Guidr returns an explicitly labelled partial assessment. With neither provider available, it falls back to a limited local pattern check. Attachments are sent only to GPT-5.6 for the active request with Responses API storage disabled; Databricks receives only locally masked extracted text.
