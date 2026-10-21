import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import { convex } from "@convex-dev/better-auth/plugins";
import { anonymous } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL;

// Local dev plus the site with and without "www.".
const trustedOrigins = new Set(["http://localhost:3000"]);
if (siteUrl) {
    const { protocol, host } = new URL(siteUrl);
    const apexHost = host.replace(/^www\./, "");
    trustedOrigins.add(`${protocol}//${apexHost}`);
    trustedOrigins.add(`${protocol}//www.${apexHost}`);
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
    return betterAuth({
        baseURL: siteUrl,
        database: authComponent.adapter(ctx),
        trustedOrigins: [...trustedOrigins],
        user: {
            deleteUser: {
                enabled: true,
            }
        },
        session: {
            // Better Auth 1.6 rejects deleteUser on sessions older than freshAge
            // (default 1 day); 1.4.9's check was effectively off. The delete flow wipes app data
            // before calling deleteUser, so keep it off until deletion can re-authenticate.
            freshAge: 0,
        },
        accountLinking: {
            enabled: true,
            trustedProviders: ["google", "github"],
        },
        socialProviders: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID!,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            },
            github: {
                clientId: process.env.GITHUB_CLIENT_ID!,
                clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            },
        },
        plugins: [
            // The Convex plugin is required for Convex compatibility
            convex({ authConfig }),
            anonymous({
                onLinkAccount: async ({ anonymousUser, newUser }) => {
                    const guestUserId = anonymousUser.user.id
                    const targetUserId = newUser.user.id
                    const mutationCtx = requireRunMutationCtx(ctx);

                    // Better Auth awaits this hook before deleting the anonymous user.
                    // Let migration errors fail the link flow so the guest account remains recoverable.
                    await mutationCtx.runMutation(internal.users.transferGuestDataToUser, {
                        guestUserId,
                        targetUserId
                    })
                }
            }),
        ],
    });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
    },
});
