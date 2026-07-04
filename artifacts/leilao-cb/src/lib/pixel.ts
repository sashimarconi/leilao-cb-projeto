const PIXEL_ID = "1572682427123499";

function fbq(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
    (window as any).fbq(...args);
  }
}

function genEventId(name: string): string {
  return `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function pixelPageView() {
  fbq("track", "PageView");
}

export function pixelViewContent(params: {
  contentId: string;
  contentName: string;
  value: number;
  currency?: string;
}) {
  fbq("track", "ViewContent", {
    content_ids: [params.contentId],
    content_name: params.contentName,
    content_type: "product",
    value: params.value,
    currency: params.currency ?? "BRL",
    eventID: genEventId("ViewContent"),
  });
}

export function pixelLead(params: {
  contentId: string;
  contentName: string;
  value: number;
}) {
  fbq("track", "Lead", {
    content_ids: [params.contentId],
    content_name: params.contentName,
    content_type: "product",
    value: params.value,
    currency: "BRL",
    eventID: genEventId("Lead"),
  });
}

export function pixelInitiateCheckout(params: {
  contentId: string;
  value: number;
  numItems?: number;
}) {
  fbq("track", "InitiateCheckout", {
    content_ids: [params.contentId],
    content_type: "product",
    value: params.value,
    currency: "BRL",
    num_items: params.numItems ?? 1,
    eventID: genEventId("InitiateCheckout"),
  });
}

export function pixelAddPaymentInfo(params: {
  contentId: string;
  value: number;
}) {
  fbq("track", "AddPaymentInfo", {
    content_ids: [params.contentId],
    content_type: "product",
    value: params.value,
    currency: "BRL",
    eventID: genEventId("AddPaymentInfo"),
  });
}

export function pixelPurchase(params: {
  contentId: string;
  contentName: string;
  value: number;
  numItems?: number;
}) {
  fbq("track", "Purchase", {
    content_ids: [params.contentId],
    content_name: params.contentName,
    content_type: "product",
    value: params.value,
    currency: "BRL",
    num_items: params.numItems ?? 1,
    eventID: genEventId("Purchase"),
  });
}

export { PIXEL_ID };
