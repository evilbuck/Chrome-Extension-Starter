// Background service worker entry (MV3). Phase 4 keeps the action-policy
// runtime, the offscreen bridge, and the request-state module. Migration
// and alarm modules are removed (sync storage and demo alarms are gone).

import './runtime';
import './connection';
import './request';