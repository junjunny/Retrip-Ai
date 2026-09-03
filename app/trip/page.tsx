import { redirect } from "next/navigation";

/** /trip has no view of its own — go straight to trip creation. */
export default function TripIndexPage() {
  redirect("/trip/create");
}
