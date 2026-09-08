// CT story module for the bound-fields mirror (Spine-Testing §7 — a CT mounts ONLY from a non-test
// module). ONE `useAppForm` carrying the bound fields whose TanStack↔Base UI state sync is under test:
// text (a DOM control that blurs natively), select and colour (trigger-based — their blur can only ride
// `onOpenChange`), multi-toggle (a group whose blur rides the group's own `onBlur`) and switch.
//
// The observation channel is the RENDERED DOM, not a readout: `<Field>` forwards `dirty`/`touched`/`name`
// into `<Field.Root>`, and Base UI turns those into `data-dirty`/`data-touched` on the root — which is
// exactly the contract the crunch said was broken, so the CT reads the attributes rather than the form
// state that feeds them. Each field's root is addressable by `data-slot="field-root"` + its label.

import { useAppForm } from "@orb/client/forms/editor";
import type { StoredAsset } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useRef } from "react";

// `tags` is annotated (not inferred `never[]`) so the bound MultiToggleField's `readonly string[]` binds.
const NO_TAGS: readonly string[] = [];
const DEFAULTS = { text: "", choice: "alpha", colour: "", tags: NO_TAGS, flag: false };

const CHOICES = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
];

const TAGS = [
  { label: "Panels", value: "panels" },
  { label: "Composer", value: "composer" },
];

/** Every state-sync-relevant bound field on one form — no network, no factory, just `useAppForm`. */
export function BoundFieldsStory(): ReactElement {
  const form = useAppForm({ defaultValues: DEFAULTS });
  return (
    <div style={{ padding: 16, width: 520 }}>
      <form.AppField name="text">{(field): ReactElement => <field.TextField label="Display name" />}</form.AppField>
      <form.AppField name="choice">{(field): ReactElement => <field.SelectField items={CHOICES} label="Variant" />}</form.AppField>
      <form.AppField name="colour">{(field): ReactElement => <field.ColorField label="Accent" />}</form.AppField>
      <form.AppField name="tags">{(field): ReactElement => <field.MultiToggleField items={TAGS} label="Surfaces" />}</form.AppField>
      <form.AppField name="flag">{(field): ReactElement => <field.SwitchField label="Streaming" />}</form.AppField>
    </div>
  );
}

function uploadedAsset(name: "old" | "new"): StoredAsset {
  return {
    assetId: castId<AssetId>(`asset_seed_${name}`),
    hash: `${name}-hash`,
    size: 3,
    created: true,
  };
}

/** A held-promise avatar upload driver. The second file is injected programmatically while the first
 *  keeps the ordinary picker inert, reproducing the callback re-entry boundary the field must own. */
export function AvatarUploadEpochStory(): ReactElement {
  const form = useAppForm({ defaultValues: { avatarAssetId: null as AssetId | null } });
  const pending = useRef(new Map<string, (asset: StoredAsset) => void>());
  const upload = (file: File): Promise<StoredAsset> =>
    new Promise((resolve) => {
      pending.current.set(file.name, resolve);
    });
  const resolveUpload = (name: "old" | "new"): void => {
    pending.current.get(`${name}.png`)?.(uploadedAsset(name));
  };

  return (
    <div style={{ padding: 16, width: 520 }}>
      <form.AppField name="avatarAssetId">{(field): ReactElement => <field.AvatarUploadField label="Portrait" upload={upload} />}</form.AppField>
      <button type="button" onClick={(): void => resolveUpload("old")}>
        Resolve old upload
      </button>
      <button type="button" onClick={(): void => resolveUpload("new")}>
        Resolve new upload
      </button>
      <form.Subscribe selector={(state): AssetId | null => state.values.avatarAssetId}>
        {(assetId): ReactElement => <output data-testid="avatar-asset-id">{assetId ?? "none"}</output>}
      </form.Subscribe>
    </div>
  );
}
