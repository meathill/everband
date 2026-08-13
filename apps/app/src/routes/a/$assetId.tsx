import { Card, CardPanel } from "@everband/ui/components/card";
import {
  EnvelopeSimpleIcon,
  IdentificationCardIcon,
  TagIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { FullPageLoader } from "~/components/page-loaders.tsx";
import { getPublicAsset } from "~/server/assets.ts";

export const Route = createFileRoute("/a/$assetId")({
  loader: async ({ params }) => {
    try {
      return { asset: await getPublicAsset({ data: { assetId: params.assetId } }) };
    } catch {
      return { asset: null };
    }
  },
  component: PublicAssetPage,
  pendingComponent: FullPageLoader,
});

function PublicAssetPage() {
  const { asset } = Route.useLoaderData();

  if (!asset) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-semibold text-2xl tracking-tight text-foreground">
          This equipment label isn't active
        </h1>
        <p className="text-muted-foreground">
          The item may have been retired or the label is no longer in use. Contact the organization
          through another known channel if you need help.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <div className="text-center">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          {asset.organizationName}
        </p>
        <h1 className="mt-2 font-semibold text-3xl tracking-tight text-foreground">{asset.name}</h1>
        <p className="mt-1 text-muted-foreground">Equipment information</p>
      </div>

      <Card>
        <CardPanel className="divide-y divide-border p-0">
          <AssetField icon={<TagIcon />} label="Category" value={asset.type} />
          {asset.serialNumber && (
            <AssetField
              icon={<IdentificationCardIcon />}
              label="Number"
              value={asset.serialNumber}
            />
          )}
          <AssetField
            icon={<UserIcon />}
            label="Current holder"
            value={asset.currentHolder ?? "Not currently assigned"}
          />
          <AssetField
            icon={<EnvelopeSimpleIcon />}
            label="Organization contact"
            value={
              asset.contactEmail ? (
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={`mailto:${asset.contactEmail}`}
                >
                  {asset.contactEmail}
                </a>
              ) : (
                "Contact the organization directly"
              )
            }
          />
        </CardPanel>
      </Card>
      <p className="text-center text-muted-foreground text-xs">
        This is a read-only equipment card. It does not provide access to member records.
      </p>
    </main>
  );
}

function AssetField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="mt-0.5 break-words font-medium text-foreground text-sm">{value}</div>
      </div>
    </div>
  );
}
