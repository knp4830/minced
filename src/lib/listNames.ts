/** "peanuts", "peanuts and soy", "peanuts, soy and dairy". Plain module so server and client code can both call it. */
export function listNames(names: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}
