type Env = Record<string, string | undefined>;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
  /** Which env var set the keys came from (for logs). */
  source: 'VAPID_*' | 'WEB_PUSH_*';
}

function value(env: Env, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

/**
 * Web Push (VAPID) credentials.
 *
 * - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`: the names homectl-infra's
 *   Terraform writes into `reisedagbok-vapid-secrets` on the cluster. These win.
 * - `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` / `WEB_PUSH_SUBJECT`: the
 *   original names (Serverless deploy, local dev, tests).
 *
 * The two key halves are always taken from the **same** set: mixing a public key from
 * one with a private key from the other would sign with a key the browsers never
 * subscribed with. Returns `null` when neither set is complete (push disabled).
 */
export function readVapidConfig(env: Env = process.env): VapidConfig | null {
  const sets = [
    { source: 'VAPID_*', pub: 'VAPID_PUBLIC_KEY', priv: 'VAPID_PRIVATE_KEY', subject: 'VAPID_SUBJECT' },
    {
      source: 'WEB_PUSH_*',
      pub: 'WEB_PUSH_VAPID_PUBLIC_KEY',
      priv: 'WEB_PUSH_VAPID_PRIVATE_KEY',
      subject: 'WEB_PUSH_SUBJECT',
    },
  ] as const;

  for (const set of sets) {
    const publicKey = value(env, set.pub);
    const privateKey = value(env, set.priv);
    const subject = value(env, set.subject);
    if (publicKey && privateKey && subject) {
      return { publicKey, privateKey, subject, source: set.source };
    }
  }
  return null;
}
