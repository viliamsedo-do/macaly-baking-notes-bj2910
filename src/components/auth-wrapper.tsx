import { AuthLoading, Authenticated, Unauthenticated } from "convex/react"

import { SignInForm } from "./sign-in-form"

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: "hsl(38 77% 95%)" }}
        >
          <p className="text-sm text-muted-foreground">…</p>
        </div>
      </AuthLoading>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  )
}
