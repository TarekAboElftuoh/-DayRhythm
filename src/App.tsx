/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppShell } from './app/AppShell';
import { useAppController } from './app/useAppController';

export default function App() {
  const a = useAppController();
  return <AppShell a={a} />;
}
