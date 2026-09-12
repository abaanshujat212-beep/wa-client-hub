const STATUS_VALUES = new Set(['ready', 'blocked', 'unknown']);

function valueAt(source, keys) {
  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
}

function boolValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', 'enabled', 'active', 'on', 'ready', 'available'].includes(normalized)) return true;
  if (['false', 'disabled', 'inactive', 'off', 'blocked', 'unavailable'].includes(normalized)) return false;
  return undefined;
}

function statusFrom(value) {
  const bool = boolValue(value);
  if (bool === true) return 'ready';
  if (bool === false) return 'blocked';
  return 'unknown';
}

function nested(source, paths) {
  for (const path of paths) {
    const value = valueAt(source, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function callsWebhookStatus(subscriptions) {
  if (subscriptions?.calls === true || subscriptions?.calls_webhook === true) return 'ready';
  if (subscriptions?.calls === false || subscriptions?.calls_webhook === false) return 'blocked';
  const apps = Array.isArray(subscriptions?.data) ? subscriptions.data : [];
  const fields = apps.flatMap(app => Array.isArray(app?.fields) ? app.fields : []);
  if (fields.length) return fields.includes('calls') ? 'ready' : 'blocked';
  return 'unknown';
}

function baseReadiness() {
  return {
    provider: 'meta',
    mode: 'graph_webrtc',
    cloudApiNumber: 'ready',
    wabaBinding: 'ready',
    appBinding: 'unknown',
    messagingPermission: 'unknown',
    callsWebhookSubscribed: 'unknown',
    callingEnabled: 'unknown',
    inboundCallingEnabled: 'unknown',
    callIconEnabled: 'unknown',
    callingHoursConfigured: 'unknown',
    callbackSettingsConfigured: 'unknown',
    productionThresholdSatisfied: 'unknown',
    countryEligible: 'unknown',
    businessInitiatedEligible: 'unknown',
    accountRestrictions: 'unknown',
    testOrProduction: 'unknown',
    canReceiveCalls: false,
    canBusinessInitiateCall: false,
    blockingReasons: [],
  };
}

function normalizeCallingReadiness({ settings, subscriptions }) {
  const result = baseReadiness();
  const source = settings?.data && typeof settings.data === 'object' ? settings.data : settings || {};
  const calling = source.calling || source.calling_settings || source.call_settings || source;
  const mode = String(nested(calling, [['mode'], ['calling_mode'], ['sip_mode']]) || '').toLowerCase();
  if (mode === 'sip' || boolValue(nested(calling, [['sip_enabled'], ['sipEnabled']])) === true) result.mode = 'sip';

  result.callsWebhookSubscribed = callsWebhookStatus(subscriptions);
  result.callingEnabled = statusFrom(nested(calling, [['enabled'], ['calling_enabled'], ['callingEnabled'], ['status']]));
  result.inboundCallingEnabled = statusFrom(nested(calling, [['inbound_enabled'], ['inboundCallingEnabled'], ['inbound_calling_enabled']]));
  result.callIconEnabled = statusFrom(nested(calling, [['call_icon_enabled'], ['callIconEnabled'], ['call_icon']]));
  result.callingHoursConfigured = statusFrom(nested(calling, [['calling_hours_configured'], ['callingHoursConfigured'], ['business_hours']]));
  result.callbackSettingsConfigured = statusFrom(nested(calling, [['callback_settings_configured'], ['callbackSettingsConfigured'], ['callback_settings']]));
  result.productionThresholdSatisfied = statusFrom(nested(source, [['production_threshold_satisfied'], ['productionThresholdSatisfied'], ['messaging_threshold_satisfied']]));
  result.countryEligible = statusFrom(nested(source, [['country_eligible'], ['countryEligible']]));
  result.businessInitiatedEligible = statusFrom(nested(calling, [['business_initiated_eligible'], ['businessInitiatedEligible']]));
  result.accountRestrictions = statusFrom(nested(source, [['account_restrictions_clear'], ['accountRestrictionsClear'], ['account_restrictions']]));
  result.testOrProduction = String(nested(source, [['mode'], ['account_mode'], ['environment']]) || 'unknown').toLowerCase();

  if (result.callsWebhookSubscribed !== 'ready') result.blockingReasons.push(result.callsWebhookSubscribed === 'blocked' ? 'CALLS_WEBHOOK_NOT_SUBSCRIBED' : 'CALLS_WEBHOOK_FIELD_UNVERIFIED');
  if (result.callingEnabled !== 'ready') result.blockingReasons.push(result.callingEnabled === 'blocked' ? 'CALLING_NOT_ENABLED' : 'CALLING_SETTINGS_UNVERIFIED');
  if (result.inboundCallingEnabled === 'blocked') result.blockingReasons.push('INBOUND_CALLING_NOT_ENABLED');
  if (result.inboundCallingEnabled === 'unknown') result.blockingReasons.push('INBOUND_CALLING_UNVERIFIED');
  if (result.callingEnabled === 'ready' && result.callsWebhookSubscribed === 'ready' && result.inboundCallingEnabled !== 'blocked') result.canReceiveCalls = true;

  // A connection-level diagnostic cannot prove permission for a specific WhatsApp user.
  result.blockingReasons.push('CALL_PERMISSION_NOT_CHECKED');
  return result;
}

function unavailableCallingReadiness(code = 'CALLING_SETTINGS_UNAVAILABLE') {
  const result = baseReadiness();
  result.blockingReasons.push(code, 'CALL_PERMISSION_NOT_CHECKED');
  return result;
}

module.exports = { normalizeCallingReadiness, unavailableCallingReadiness, statusFrom, callsWebhookStatus };
