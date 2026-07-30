/**
 * Redirect → the "My Estimations" tab of the consolidated Project Estimation workspace.
 * The old standalone screen is now a tab (single sidebar module); this keeps bookmarks working.
 */
import { redirect } from 'next/navigation';

export default function MyEstimationsRedirectPage() {
    redirect('/project-estimation?tab=my-estimations');
}
