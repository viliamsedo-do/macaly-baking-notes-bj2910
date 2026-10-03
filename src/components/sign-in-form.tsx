import { useState } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useTranslation } from "react-i18next"

export function SignInForm() {
  const { t } = useTranslation()
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const formData = new FormData(e.currentTarget)
      setEmail(formData.get("email") as string)
      await signIn("resend-otp", formData)
      setStep("code")
    } catch {
      setError(t("auth.errorSend"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setResent(false)
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.set("email", email)
      await signIn("resend-otp", formData)
      setResent(true)
    } catch {
      setError(t("auth.errorSend"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCodeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const formData = new FormData(e.currentTarget)
      await signIn("resend-otp", formData)
    } catch {
      setError(t("auth.errorVerify"))
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-crust focus:outline-none focus:ring-3 focus:ring-crust/20"
  const btnClass =
    "w-full rounded-lg bg-crust text-white font-bold text-sm px-5 py-3 hover:bg-crust-deep transition-colors disabled:opacity-50"

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "hsl(38 77% 95%)" }}
      data-testid="signin"
    >
      <div className="w-full max-w-sm rounded-xl border border-grain-line bg-dough p-6 shadow-sm">
        {step === "code" ? (
          <form onSubmit={handleCodeSubmit} className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-crust-deep m-0">
              {t("auth.checkEmail")}
            </h2>
            <p className="text-sm text-muted-foreground m-0">
              {t("auth.codeSentTo", { email })}
            </p>
            {error && (
              <p className="text-sm text-destructive m-0" role="alert">
                {error}
              </p>
            )}
            <input name="email" value={email} type="hidden" />
            <input
              name="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              placeholder={t("auth.code")}
              required
              disabled={isLoading}
              className={inputClass}
              data-testid="otp"
            />
            <button type="submit" disabled={isLoading} className={btnClass}>
              {isLoading ? t("auth.verifying") : t("auth.verify")}
            </button>
            {resent && (
              <p className="text-xs text-muted-foreground m-0" data-testid="resent-info">
                {t("auth.resentInfo")}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={isLoading}
              className="text-sm text-crust-deep underline cursor-pointer"
              data-testid="resend-code"
            >
              {isLoading ? t("auth.sending") : t("auth.resend")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email")
                setError(null)
                setResent(false)
              }}
              disabled={isLoading}
              className="text-sm text-muted-foreground underline cursor-pointer"
            >
              {t("auth.differentEmail")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-crust-deep m-0">
              {t("auth.signIn")}
            </h2>
            <p className="text-sm text-muted-foreground m-0">
              {t("auth.loginRequired")}
            </p>
            {error && (
              <p className="text-sm text-destructive m-0" role="alert">
                {error}
              </p>
            )}
            <input
              name="email"
              type="email"
              placeholder={t("auth.email")}
              required
              disabled={isLoading}
              className={inputClass}
              data-testid="signin-email"
            />
            <button type="submit" disabled={isLoading} className={btnClass}>
              {isLoading ? t("auth.sending") : t("auth.sendCode")}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
