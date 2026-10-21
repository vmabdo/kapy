// The statement is client-type agnostic: it detects PHARMACY vs EXTERNAL_WAREHOUSE
// and renders the correct backlink. Re-export the shared implementation so both
// entity routes expose the exact same accounting logic.
export const dynamic = "force-dynamic";

export {
  default,
  generateMetadata,
} from "../../../pharmacies/[id]/statement/page";
