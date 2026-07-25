import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Authed surface: only `/app` and its descendants. Marketing, /audit, /sign-in,
// /sign-up, and any future public route stay anonymous so SSR/ISR works.
const isProtectedRoute = createRouteMatcher(["/app(/.*)?"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Standard Clerk matcher: skip Next internals + most static files, always run
  // for API and tRPC routes (so getToken() is wired on those too).
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
