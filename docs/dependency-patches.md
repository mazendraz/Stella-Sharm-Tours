# Dependency maintenance patches

## next-intl 4.15.0 and the picomatch advisory

The production audit flagged
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
on the `next-intl → @parcel/watcher → picomatch` path. The workspace uses
checked-in message dictionaries. The public app resolves the next-intl request
config with its Webpack and Turbopack aliases, and the version-scoped pnpm
override removes the extraction watcher. Revisit the override when upgrading
next-intl or adopting its extraction feature.

Docker release stages install the frozen production dependency tree separately
from the build. The runtime still includes `tsx` for the API, worker, and
database commands. The two Next configs use JavaScript with JSDoc types so
Next can start with a read-only filesystem and without the TypeScript
compiler. Developer tools retain their own picomatch dependency on the host.
Next.js also embeds a separate compiled matcher. In the reviewed runtime
matcher calls, the glob pattern comes from Next configuration.

Verify with `pnpm audit --prod --audit-level moderate`, a production image
inventory check, and a localized route smoke test from the web image.

## Next.js 15.5.29 — repeat tag invalidation

`patches/next@15.5.29.patch` updates the tag's invalidation timestamp on **every**
call in the CommonJS and ESM file-system cache implementations. The pinned
[upstream source](https://github.com/vercel/next.js/blob/v15.5.29/packages/next/src/server/lib/incremental-cache/file-system-cache.ts#L90)
only inserts a timestamp when the map has no entry. Inspection plus our actual
cache regression reproduced this sequence: first invalidation expires old data;
data fetched afterward survives a second invalidation of the same tag. This
breaks successive admin price edits and Undo in a long-running web process.

The regression in `apps/web/cache-revalidation.test.ts` fails on the unpatched
package and passes with the patch. It invokes the real installed cache and
checks expiration of data populated between two invalidations. Real UI tests
also exercise price change → public page → Undo and hero change → Undo in the
same process, including repeat runs. The patch changes two tiny method bodies;
the version and its other security fixes remain pinned.

pnpm records the patch and its hash in `package.json`/`pnpm-lock.yaml`. Docker
copies `patches/` before frozen dependency installation. Do not edit installed
`node_modules`, downgrade Next to avoid the issue, or silently drop the patch.
On an upstream upgrade, check the implementation and rerun the regression plus
the actual repeated publication tests before removing/replacing this patch.
This is a project maintenance fix, not an upstream approval or security advisory.
