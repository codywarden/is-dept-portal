This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Reconcile API Actions

For activation reconcile endpoints, use these action values:

- `mark_reconclied`
- `mark_not_reconclied`

File-level reconcile route also supports:

- `lock`
- `unlock`

Legacy `match` / `unmatch` action names are no longer supported.

## Activation Email Uploads

You can ingest Activation files from an inbound email webhook by posting email attachments to:

- `POST /api/activation/subscriptions/email-upload`

Required environment variables:

- `ACTIVATION_EMAIL_UPLOAD_SECRET`: shared secret used to authorize the webhook.
- `ACTIVATION_EMAIL_UPLOAD_USER_ID`: Supabase user id used as `uploaded_by` for email-ingested files.

Authentication:

- Set `x-activation-email-secret` header to your `ACTIVATION_EMAIL_UPLOAD_SECRET`.
- You can also send the secret as form-data field `secret`.
- You can also pass the secret in the webhook URL query string: `?secret=...`.

How files are classified:

- Subject/filename containing `cost` -> cost upload parser.
- Subject/filename containing `retail` or `sold` -> retail parser.
- Optional form field `uploadType` (`cost` or `sold`) forces the parser.
- Optional query param `uploadType` (`cost` or `sold`) also forces the parser.

Optional form-data fields:

- `subject`: email subject line (used for parser inference)
- `style`: cost parser style (`auto`, `new`, or `old`)

Example webhook request:

```bash
curl -X POST http://localhost:3000/api/activation/subscriptions/email-upload \
	-H "x-activation-email-secret: YOUR_SECRET" \
	-F "subject=Activation Cost Upload" \
	-F "attachment=@/path/to/cost.pdf"

# If your provider cannot set custom headers, use query auth:
curl -X POST "http://localhost:3000/api/activation/subscriptions/email-upload?secret=YOUR_SECRET" \
	-F "subject=Activation Cost Upload" \
	-F "attachment=@/path/to/cost.pdf"

# Force cost parser from webhook URL (useful for separate inbound addresses):
curl -X POST "http://localhost:3000/api/activation/subscriptions/email-upload?secret=YOUR_SECRET&uploadType=cost" \
	-F "attachment=@/path/to/cost.pdf"
```
