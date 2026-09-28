type AuthEmailError = { code?: string; status?: number; message?: string };

export function authEmailFailure(error: AuthEmailError, audience: "client" | "staff") {
  if (audience === "staff" && ["email_exists", "user_already_exists"].includes(error.code ?? "")) {
    return {
      error:
        "An Auth account with this email already exists, but it was not safely linked to this firm invitation. If the person is already on your Team page, use Send access link. Otherwise use a different email or review the account before granting access.",
      cooldownSeconds: 0,
    };
  }

  if (audience === "staff" && error.code === "unexpected_failure") {
    return {
      error:
        "Supabase Auth could not complete the staff invitation. The portal kept the invitation record so you can retry after checking Auth logs or email delivery.",
      cooldownSeconds: 0,
    };
  }

  const emailLimit =
    error.code === "over_email_send_rate_limit" ||
    /email rate limit exceeded/i.test(error.message ?? "");
  const rateLimited =
    emailLimit ||
    error.status === 429 ||
    error.code === "over_request_rate_limit";

  if (emailLimit) {
    return {
      error:
        audience === "staff"
          ? "The Auth email service has reached its sending limit. Check Supabase Authentication SMTP/provider settings and rate limits, then retry after the provider allows sending again."
          : "Sign-in emails are temporarily unavailable because the email service has reached its sending limit. Please try later or contact your firm. If you already received a sign-in link, use that email.",
      cooldownSeconds: 60,
    };
  }

  if (rateLimited) {
    return {
      error: "Too many requests. Please wait before trying again.",
      cooldownSeconds: 60,
    };
  }

  return {
    error:
      audience === "staff"
        ? "The staff access email could not be sent. The invitation record is still available in Team so you can retry without recreating the staff member."
        : "We couldn't send a sign-in link. Please try later or contact your firm.",
    cooldownSeconds: 0,
  };
}
