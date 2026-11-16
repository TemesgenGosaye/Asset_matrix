# Code signing

The desktop build is ready for Authenticode signing through electron-builder.
No certificate is stored in this repository.

## 1. Obtain a certificate

Use a code-signing certificate issued to the publisher (for example a standard
OV/EV Authenticode certificate or an organization-managed certificate). Keep the
`.pfx`/`.p12` file outside the repository.

## 2. Set the signing environment variables

```powershell
$env:CSC_LINK = "C:\secure\metahara-code-signing.pfx"
$env:CSC_KEY_PASSWORD = "the-certificate-password"

cd desktop
npm run build
```

`CSC_LINK` may also be a base64-encoded certificate or a URL, depending on the
signing setup. For Windows-only environments, electron-builder also accepts
`WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

For a hardware token or custom signing command, configure
`win.sign`/`windowsSign` in `electron-builder.yml` according to your certificate
provider's instructions.

## 3. Verify the signature

```powershell
Get-AuthenticodeSignature "desktop\dist\MSF-House-Administration-Portal-Setup-1.0.0.exe" |
  Format-List Status, StatusMessage, SignerCertificate
```

The installer and the installed application executable should both report
`Status: Valid`.

## 4. Do not commit secrets

Add certificate files and passwords to your local ignore list. The repository
already ignores common certificate extensions inside this folder. Never commit a
`.pfx`, `.p12`, `.key`, or password file.
