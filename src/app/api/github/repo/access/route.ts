import { NextRequest, NextResponse } from "next/server";
import { checkRepoAccess } from "@/lib/github";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const token = request.headers.get("x-github-token") ?? searchParams.get("token");

    if (!owner || !repo) {
        return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
    }

    const access = await checkRepoAccess(owner, repo, token);

    if (!access.ok) {
        return NextResponse.json(
            {
                ok: false,
                needsAuth: access.status === 404,
                status: access.status,
            },
            { status: access.status }
        );
    }

    return NextResponse.json({
        ok: true,
        isPrivate: access.isPrivate,
        fullName: access.fullName,
    });
}
