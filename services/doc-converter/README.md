# Cooking Confidential legacy Word conversion service

This isolated service converts binary Word `.doc` files into genuine `.docx` files with LibreOffice headless. The existing Cooking Confidential DOCX extraction pipeline can then process the converted file. It does not rename a `.doc` file or store uploads permanently.

## Run locally

```sh
cd services/doc-converter
docker build -t cc-doc-converter .
docker run --rm -p 8080:8080 -e CONVERTER_API_KEY='replace-with-a-long-random-secret' cc-doc-converter
```

Health check: `GET /health`.

Conversion: `POST /convert/doc-to-docx` as multipart form field `file`, with header `Authorization: Bearer <CONVERTER_API_KEY>`. Response is a DOCX binary. The service accepts only `.doc`, limits uploads to 20 MiB by default, times out conversion after 45 seconds, uses a unique LibreOffice profile, and deletes its temporary working directory after the response. Set `CONVERTER_API_KEY` to a long random secret; the service deliberately refuses conversion if it is unset.

Example:

```sh
curl -fS -H 'Authorization: Bearer YOUR_SECRET' \
  -F 'file=@sample.doc' \
  http://localhost:8080/convert/doc-to-docx -o sample.docx
```

## Deployment / integration status

This is the conversion engine container, not a public deployment. Deploy it to a private or authenticated container host that supports Docker, configure `CONVERTER_API_KEY` as a secret, and enforce HTTPS. Do not expose the endpoint without authentication. The Staging front end must not enable `.doc` selection until the deployed HTTPS endpoint and secret-backed server-to-server proxy/integration are configured. Do not put the conversion API secret in browser JavaScript or the static GitHub Pages site.

The GitHub Pages front end cannot run LibreOffice itself, and Supabase Edge Functions do not provide the LibreOffice executable. The conversion endpoint therefore needs a separate container host or equivalent managed conversion service. No Live files or Supabase functions are changed by this service addition.
