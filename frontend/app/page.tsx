import { redirect } from 'next/navigation';

/**
 * Landing route. The app's home is **Project Management** (`/projects`) — every "go home" path
 * (direct visit, post-login redirect in `app/login/page.tsx`, and the signed-in bounce in
 * `proxy.ts`) resolves here and is forwarded to the project hub.
 *
 * The previous dashboard overview lives at `/dashboard` (kept out of the sidebar menu).
 */
export default function Home() {
  redirect('/projects');
}
