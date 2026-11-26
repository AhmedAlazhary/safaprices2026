# Customer price release workflow

The customer portal reads only `assets/data/client-prices.json`. It does not
connect to Firestore. Keep drafts, audit events, and version history in the
internal Firestore collections; never place those records or source workbook
columns such as market price or commission in the public JSON.

## Preparing a release

1. Import `Sheet2` or `Sheet2 (3)` from the approved pricing workbook in the
   internal price editor. The importer compares matching public sheets and
   refuses to choose if their content differs.
2. Review the full destination and price list. Import map coordinates only as
   candidates, explicitly approve each place match, and confirm the coordinate
   source before saving the draft.
3. Save the draft, preview it, then generate the public JSON. The editor also
   records an immutable internal Firestore version and audit event.
4. Review the downloaded `client-prices-vNNNN.json`. It contains only the
   allow-listed public schema validated by `js/public-price-schema.mjs`.
5. Replace `assets/data/client-prices.json` with the reviewed file in a code
   change, review that diff, and publish the site through the repository's
   normal reviewed workflow. The admin editor never uploads or publishes this
   file automatically and holds no repository token.

Until that reviewed file change is made, customer prices remain unchanged.
The checked-in file is an empty bootstrap so no unapproved workbook prices are
public by default. Firestore rules in this repository are local source only;
they have not been deployed. Public visitors have no Firestore read grant.
