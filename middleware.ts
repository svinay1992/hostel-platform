import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. STUDENT LANE: Security rules for the portal
  if (path.startsWith('/portal')) {
    const hasStudentBadge = request.cookies.has('hmp_student_token');
    
    // If they have no badge and are trying to view the portal, send to student login
    if (!hasStudentBadge && path !== '/portal-login') {
      return NextResponse.redirect(new URL('/portal-login', request.url));
    }
    // If they have a badge and try to log in again, send to portal
    if (hasStudentBadge && path === '/portal-login') {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
    return NextResponse.next();
  }

  // 2. ADMIN LANE: Security rules for the main dashboard
  const hasAdminBadge = request.cookies.has('hmp_access_token');
  const isAdminLogin = path === '/login';

  if (!hasAdminBadge && !isAdminLogin) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (hasAdminBadge && isAdminLogin) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};