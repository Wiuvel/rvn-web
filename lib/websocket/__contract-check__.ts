/**
 * WebSocket contract drift detection (compile-time).
 *
 * Performs structural type-level equality between our public types in
 * `lib/websocket/types.ts` and the upstream snapshot in
 * `lib/websocket/__upstream__/server-types.ts`. If the two diverge,
 * `pnpm run type:check` (and any `tsc` build) fails with a clear error.
 *
 * To resolve a failure:
 *   1. Inspect the diff: `pnpm run ws:contract:sync` (fetches latest upstream).
 *   2. If upstream changed intentionally, update `lib/websocket/types.ts` to
 *      match the new contract, then re-run `pnpm run ws:contract:sync` to
 *      refresh the snapshot.
 *   3. If our local types changed accidentally, revert them.
 *
 * @module lib/websocket/__contract-check__
 */

import type {
  AckResponse as OurAckResponse,
  BroadcastCommentPayload as OurBroadcastCommentPayload,
  BroadcastMessagePayload as OurBroadcastMessagePayload,
  BroadcastMessageReadPayload as OurBroadcastMessageReadPayload,
  BroadcastNotificationPayload as OurBroadcastNotificationPayload,
  BroadcastSystemPayload as OurBroadcastSystemPayload,
  BroadcastTicketAssignedPayload as OurBroadcastTicketAssignedPayload,
  BroadcastTicketUpdatePayload as OurBroadcastTicketUpdatePayload,
  WebSocketEvents as OurWebSocketEvents,
  WsNotificationPayload as OurWsNotificationPayload,
  WsProfileComment as OurWsProfileComment,
  WsSupportMessage as OurWsSupportMessage,
  WsTicketUpdate as OurWsTicketUpdate,
  WsUserProfile as OurWsUserProfile,
} from './types';
import type {
  AckResponse as UpstreamAckResponse,
  BroadcastCommentPayload as UpstreamBroadcastCommentPayload,
  BroadcastMessagePayload as UpstreamBroadcastMessagePayload,
  BroadcastMessageReadPayload as UpstreamBroadcastMessageReadPayload,
  BroadcastNotificationPayload as UpstreamBroadcastNotificationPayload,
  BroadcastSystemPayload as UpstreamBroadcastSystemPayload,
  BroadcastTicketAssignedPayload as UpstreamBroadcastTicketAssignedPayload,
  BroadcastTicketUpdatePayload as UpstreamBroadcastTicketUpdatePayload,
  NotificationPayload as UpstreamNotificationPayload,
  ProfileComment as UpstreamProfileComment,
  SupportMessage as UpstreamSupportMessage,
  TicketUpdate as UpstreamTicketUpdate,
  UserProfile as UpstreamUserProfile,
  WebSocketEvents as UpstreamWebSocketEvents,
} from './__upstream__/server-types';

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Strict structural type equality.
 * Resolves to `true` only when X and Y are identical down to property
 * variance and modifiers. Resolves to `false` otherwise.
 */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/** Forces `T` to extend `true`; emits a TS error when called with `false`. */
type Expect<T extends true> = T;

/* ------------------------------------------------------------------------- */
/* Domain models                                                              */
/* ------------------------------------------------------------------------- */

type _UserProfile = Expect<Equal<OurWsUserProfile, UpstreamUserProfile>>;
type _SupportMessage = Expect<Equal<OurWsSupportMessage, UpstreamSupportMessage>>;
type _TicketUpdate = Expect<Equal<OurWsTicketUpdate, UpstreamTicketUpdate>>;
type _ProfileComment = Expect<Equal<OurWsProfileComment, UpstreamProfileComment>>;
type _NotificationPayload = Expect<Equal<OurWsNotificationPayload, UpstreamNotificationPayload>>;

/* ------------------------------------------------------------------------- */
/* Broadcast payloads                                                         */
/* ------------------------------------------------------------------------- */

type _BroadcastMessagePayload = Expect<
  Equal<OurBroadcastMessagePayload, UpstreamBroadcastMessagePayload>
>;
type _BroadcastTicketUpdatePayload = Expect<
  Equal<OurBroadcastTicketUpdatePayload, UpstreamBroadcastTicketUpdatePayload>
>;
type _BroadcastTicketAssignedPayload = Expect<
  Equal<OurBroadcastTicketAssignedPayload, UpstreamBroadcastTicketAssignedPayload>
>;
type _BroadcastMessageReadPayload = Expect<
  Equal<OurBroadcastMessageReadPayload, UpstreamBroadcastMessageReadPayload>
>;
type _BroadcastCommentPayload = Expect<
  Equal<OurBroadcastCommentPayload, UpstreamBroadcastCommentPayload>
>;
type _BroadcastNotificationPayload = Expect<
  Equal<OurBroadcastNotificationPayload, UpstreamBroadcastNotificationPayload>
>;
type _BroadcastSystemPayload = Expect<
  Equal<OurBroadcastSystemPayload, UpstreamBroadcastSystemPayload>
>;

/* ------------------------------------------------------------------------- */
/* Socket.IO event map                                                        */
/* ------------------------------------------------------------------------- */

type _AckResponse = Expect<Equal<OurAckResponse, UpstreamAckResponse>>;

/**
 * Per-event structural assertion. Each event handler signature in our
 * `WebSocketEvents` must match the upstream signature for the same key.
 *
 * We compare event-by-event (rather than the whole map) so a divergence
 * surfaces with a precise, key-level error.
 */
type AssertEventsEqual = {
  [K in keyof UpstreamWebSocketEvents]: K extends keyof OurWebSocketEvents
    ? Expect<Equal<OurWebSocketEvents[K], UpstreamWebSocketEvents[K]>>
    : never;
} & {
  [K in keyof OurWebSocketEvents]: K extends keyof UpstreamWebSocketEvents
    ? Expect<Equal<OurWebSocketEvents[K], UpstreamWebSocketEvents[K]>>
    : never;
};

type _Events = AssertEventsEqual;

/* ------------------------------------------------------------------------- */
/* Re-export to silence unused-type warnings                                  */
/* ------------------------------------------------------------------------- */

/**
 * Aggregate marker used as a single import target for tooling/tests that
 * want to ensure this file is loaded by the type checker.
 */
export type WsContractCheck = readonly [
  _UserProfile,
  _SupportMessage,
  _TicketUpdate,
  _ProfileComment,
  _NotificationPayload,
  _BroadcastMessagePayload,
  _BroadcastTicketUpdatePayload,
  _BroadcastTicketAssignedPayload,
  _BroadcastMessageReadPayload,
  _BroadcastCommentPayload,
  _BroadcastNotificationPayload,
  _BroadcastSystemPayload,
  _AckResponse,
  _Events,
];
