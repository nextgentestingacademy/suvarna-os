import React from 'react';
import { SettingsContent } from '@/components/workspace/settings-content';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  return SettingsContent();
}
