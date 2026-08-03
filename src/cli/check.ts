import type BaseDestinationPlugin from '../plugins/destination/base.ts';
import type BaseSourcePlugin from '../plugins/source/base.ts';
import { getItemState, setItemState } from '../db/state.ts';
import { runWithErrorContext } from '../db/errors.ts';
import { contextLabel, describeError } from '../utils/format.ts';

async function checkItem(
  context: string,
  source: BaseSourcePlugin,
  destinations: BaseDestinationPlugin[],
  sourceName: string,
  item: string,
) {
  const current = await source.read(item);
  if (!current) return;

  const previous = await getItemState(context, sourceName, item);

  if (previous !== null && !source.updated(previous, current)) return;

  const msg = source.message(previous ?? '', current, item);
  console.log(`${contextLabel(context)}${msg}`);

  const config = source.getConfig();
  const targetDestinations = config.destinations
    ? destinations.filter((d) => config.destinations!.includes(d.getAlias()))
    : destinations;

  const delivered = await Promise.all(
    targetDestinations.map((dest) =>
      dest.notify(msg).catch((error) => {
        console.error(`Destination ${dest.getAlias()} failed: ${describeError(error)}`);
        return false;
      })
    ),
  );

  if (targetDestinations.length > 0 && !delivered.some(Boolean)) {
    console.error(
      `${contextLabel(context)}No destination accepted the update for ${item}, retrying on next check`,
    );
    return;
  }

  await setItemState(context, sourceName, item, current);
}

export default function checkSource(
  context: string,
  source: BaseSourcePlugin,
  destinations: BaseDestinationPlugin[],
) {
  return runWithErrorContext(context, async () => {
    const sourceName = source.getAlias();
    const items: string[] = source.getConfig().items ?? [''];

    for (const item of items) {
      try {
        await checkItem(context, source, destinations, sourceName, item);
      } catch (error) {
        console.error(`Check failed for ${contextLabel(context)}${sourceName}/${item}: ${describeError(error)}`);
      }
    }
  });
}
