import { DemoFixtureChip } from "./DemoFixtureChip";
import { ExperimentalBadge } from "./ExperimentalBadge";
import { SimBadge } from "./SimBadge";

/** Left-bottom map chips: WeatherNext Experimental, RF/Edge SIM, then FIRMS demo. */
export function MapLegendStack({
  firmsDemoFixture,
}: {
  firmsDemoFixture: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        <ExperimentalBadge label="WeatherNext" />
        <SimBadge label="RF" />
        <SimBadge label="Edge" />
      </div>
      {firmsDemoFixture ? <DemoFixtureChip /> : null}
    </div>
  );
}
