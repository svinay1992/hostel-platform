import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  
  // 1. Check if the user's browser has the secure badge we created
  const hasAccessBadge = request.cookies.has('hmp_access_token');
  
  // 2. Check if the user is currently trying to load the login page
  const isLoginPage = request.nextUrl.pathname === '/login';

  // SCENARIO A: No badge, and trying to access a secure page? Kick them to login.
  if (!hasAccessBadge && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // SCENARIO B: Has a badge, but trying to view the login page again? Send to dashboard.
  if (hasAccessBadge && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // SCENARIO C: Has a badge and accessing a secure page. Let them pass!
  return NextResponse.next();
}

// 3. Apply this security check to every page EXCEPT background Next.js files/images
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};