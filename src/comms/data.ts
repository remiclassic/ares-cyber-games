import type { Incident } from "./engine";
import { corran } from "./corran";
import { wrenfield } from "./wrenfield";

// Two fictional incidents: the first is coached for its opening turn, the second has no coaching.
// Organisations, people, the regulator ("Data Protection Office"), its 72-hour rule and the
// insurers' 24-hour rule are invented for the game and stated in-game; none of it asserts a real
// law. Domains are .example. Content to be reviewed with SMEs (docs/design/INCIDENT_COMMS.md).
export const INCIDENTS: readonly Incident[] = [corran, wrenfield];
