import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { anonymous } from "better-auth/plugins";
import { api, components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
    return betterAuth({
        baseURL: siteUrl,
        database: authComponent.adapter(ctx),
        trustedOrigins: [
            "http://localhost:3000",
            "https://www.tsl-graph.xyz",
            "https://tsl-graph.xyz",
        ],
        user: {
            deleteUser: {
                enabled: true,
            }
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
                    console.log("ON LINK=============")
                    const guestUserId = anonymousUser.user.id
                    const targetUserId = newUser.user.id

                    // Use ctx from the outer createAuth scope to run the mutation
                    await (ctx as any).runMutation(api.users.transferGuestDataToUser, {
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