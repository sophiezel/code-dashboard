import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ua = request.headers.get("user-agent") || "";

  // 只在根路径检测，避免无限重定向
  if (pathname === "/" && MOBILE_REGEX.test(ua)) {
    const url = request.nextUrl.clone();
    url.pathname = "/mobile";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
