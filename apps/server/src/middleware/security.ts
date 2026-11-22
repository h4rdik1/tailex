import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Security headers (docs/SECURITY.md, "Content-Security-Policy"). Everything the page loads must
 * come from our own origin. The single exception is `blob:` for the PDF preview: the compiled PDF
 * is shown through `URL.createObjectURL`, so the iframe needs `frame-src blob:`.
 */
const DIRECTIVES: Record<string, string[]> = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  frameSrc: ["'self'", 'blob:'],
  objectSrc: ['blob:'],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

/** Switches off every browser feature the app does not use. */
const PERMISSIONS_POLICY = [
  'accelerometer',
  'autoplay',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'payment',
  'usb',
]
  .map((feature) => `${feature}=()`)
  .join(', ');

export interface SecurityOptions {
  /**
   * In production the page is served over https, so the browser may upgrade any http request.
   * Not in development: `http://localhost` must keep working.
   */
  production: boolean;
}

export function securityHeaders({ production }: SecurityOptions): RequestHandler[] {
  const csp = helmet({
    // useDefaults off: the policy is exactly the one in docs/SECURITY.md, nothing hidden.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { ...DIRECTIVES, ...(production ? { upgradeInsecureRequests: [] } : {}) },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  });
  const permissions: RequestHandler = (_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  };
  return [csp, permissions];
}
