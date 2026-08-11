import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import type React from "react";
import {
  getRehearsalOverview,
  listRehearsalSeries,
  listSeriesInputs,
} from "~/server/rehearsals.ts";
import { OccurrenceList } from "./rehearsals/-components/occurrence-list.tsx";
import { SeriesSection } from "./rehearsals/-components/series-section.tsx";
import { SwapSection } from "./rehearsals/-components/swap-section.tsx";

type Overview = Awaited<ReturnType<typeof getRehearsalOverview>>;
type SeriesInputs = Awaited<ReturnType<typeof listSeriesInputs>>;
type SeriesRows = Awaited<ReturnType<typeof listRehearsalSeries>>;
type Loaded = Overview & SeriesInputs & { series: SeriesRows; isStaff: boolean };

export const Route = createFileRoute("/o/$orgId/rehearsals")({
  loader: async ({ params }): Promise<Loaded> => {
    try {
      const overview = await getRehearsalOverview({ data: { orgId: params.orgId } });
      const isStaff = overview.role === "owner" || overview.role === "staff";
      if (!isStaff) {
        return { ...overview, terms: [], groups: [], series: [], isStaff };
      }
      // staff 才需要的两块：建 series 的下拉数据 + series 一览
      const [inputs, series] = await Promise.all([
        listSeriesInputs({ data: { orgId: params.orgId } }),
        listRehearsalSeries({ data: { orgId: params.orgId } }),
      ]);
      return { ...overview, ...inputs, series, isStaff };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: RehearsalsPage,
});

const orgRoute = getRouteApi("/o/$orgId");

function RehearsalsPage(): React.ReactElement {
  const data = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const { org } = orgRoute.useLoaderData();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Rehearsals</h1>

      {data.isStaff && (
        <SeriesSection groups={data.groups} orgId={orgId} series={data.series} terms={data.terms} />
      )}

      {data.isStaff && data.pendingSwaps.length > 0 && (
        <SwapSection
          assignments={data.assignments}
          eligibleHouseholds={data.eligibleHouseholds}
          occurrences={data.occurrences}
          orgId={orgId}
          pendingSwaps={data.pendingSwaps}
        />
      )}

      <OccurrenceList
        assignments={data.assignments}
        isStaff={data.isStaff}
        myHouseholds={data.myHouseholds}
        mySwaps={data.mySwaps}
        occurrences={data.occurrences}
        orgId={orgId}
        timezone={org.timezone}
      />
    </div>
  );
}
