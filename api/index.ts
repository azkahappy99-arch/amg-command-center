import app from '../server.js';

export default function handler(req: any, res: any) {
  // Restore original request URL if rewritten by Vercel serverless layer
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-invoke-path'];
  if (
    typeof matchedPath === 'string' &&
    matchedPath.startsWith('/api') &&
    (req.url === '/api' || req.url === '/api/index' || req.url === '/' || req.url?.startsWith('/api/index?'))
  ) {
    const queryIdx = req.url.indexOf('?');
    const queryPart = queryIdx !== -1 && !matchedPath.includes('?') ? req.url.slice(queryIdx) : '';
    req.url = `${matchedPath}${queryPart}`;
  }

  return app(req, res);
}
