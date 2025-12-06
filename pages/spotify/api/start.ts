import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const scopes =
    process.env.SPOTIFY_SCOPES ??
    'user-read-playback-state user-modify-playback-state user-read-currently-playing';

  if (!clientId || !redirectUri) {
    res.status(500).json({ error: 'Server not configured: missing env vars' });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');

  res.setHeader('Set-Cookie', [
    `spotify_auth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  ]);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  const redirectUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;

  res.writeHead(302, { Location: redirectUrl });
  res.end();
}