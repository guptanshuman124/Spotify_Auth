import type { NextApiRequest, NextApiResponse } from 'next';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const extensionRedirectUri = process.env.EXTENSION_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri || !extensionRedirectUri) {
    res.status(500).json({
      error: 'Server missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI / EXTENSION_REDIRECT_URI',
    });
    return;
  }

  // Extract Spotify params
  const { code, state, error } = req.query;

  // If user denied access / Spotify failed
  if (error) {
    const redirectUrl = `${extensionRedirectUri}#error=${encodeURIComponent(String(error))}`;
    res.writeHead(302, { Location: redirectUrl });
    res.end();
    return;
  }

  if (!code || !state) {
    const redirectUrl = `${extensionRedirectUri}#error=missing_code_or_state`;
    res.writeHead(302, { Location: redirectUrl });
    res.end();
    return;
  }

  // Validate returned state matches stored state cookie
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, v] = c.trim().split('=');
      return [k, decodeURIComponent(v || '')];
    }),
  );

  const storedState = cookies['spotify_auth_state'];

  if (!storedState || storedState !== state) {
    const redirectUrl = `${extensionRedirectUri}#error=state_mismatch`;
    res.writeHead(302, {
      'Set-Cookie': 'spotify_auth_state=; Path=/; Max-Age=0',
      Location: redirectUrl,
    });
    res.end();
    return;
  }

  // Clear state cookie
  res.setHeader('Set-Cookie', 'spotify_auth_state=; Path=/; Max-Age=0');

  // Exchange code -> access/refresh tokens
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = (await tokenResponse.text()).slice(0, 200);
    const redirectUrl = `${extensionRedirectUri}#error=token_request_failed&details=${encodeURIComponent(
      errorText,
    )}`;
    res.writeHead(302, { Location: redirectUrl });
    res.end();
    return;
  }

  const tokenJson = await tokenResponse.json();

  const accessToken = tokenJson.access_token;
  const refreshToken = tokenJson.refresh_token ?? '';
  const expiresIn = tokenJson.expires_in ?? '';

  // Redirect back to Chrome extension with tokens in fragment
  const params = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: String(expiresIn),
  });

  const redirectUrl = `${extensionRedirectUri}#${params.toString()}`;
  res.writeHead(302, { Location: redirectUrl });
  res.end();
}