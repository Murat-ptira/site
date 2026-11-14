/**
 * User-facing wording for response failures. Shared by the server (which
 * stores only the code) and the browser, so a failed response reads the same
 * live and after a reload.
 */
export type ResponseErrorCode =
  | "provider_auth"
  | "provider_quota"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_network"
  | "provider_bad_request"
  | "context_too_long"
  | "content_filtered"
  | "model_unavailable"
  | "empty_response"
  | "interrupted"
  | "internal";

export function describeResponseError(code: string, providerName: string): string {
  switch (code as ResponseErrorCode) {
    case "provider_auth":
      return `${providerName} rejected the API key configured for this workspace. An administrator needs to update it.`;
    case "provider_quota":
      return `The ${providerName} account behind this workspace is out of quota. An administrator needs to top it up.`;
    case "provider_rate_limited":
      return `${providerName} is rate limiting requests right now. Wait a moment and try again.`;
    case "provider_unavailable":
      return `${providerName} is having trouble right now. Try again shortly or switch to another model.`;
    case "provider_timeout":
      return `${providerName} took too long to respond. Try again or switch to another model.`;
    case "provider_network":
      return `Couldn't reach ${providerName}. Check the connection and try again.`;
    case "provider_bad_request":
      return `${providerName} couldn't process this request.`;
    case "context_too_long":
      return "This conversation is too long for the selected model. Start a new chat to continue.";
    case "content_filtered":
      return `${providerName} declined to answer this request.`;
    case "model_unavailable":
      return "This model is no longer available. Pick another one.";
    case "empty_response":
      return `${providerName} returned an empty response. Try again.`;
    case "interrupted":
      return "This response was interrupted before it finished.";
    default:
      return "Something went wrong while generating this response.";
  }
}

/** Failed responses are never charged; say so wherever an error is shown. */
export const NOT_CHARGED_NOTE = "You were not charged.";
