/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArenaViewport } from './components/ArenaViewport';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ArenaViewport />
    </ErrorBoundary>
  );
}
