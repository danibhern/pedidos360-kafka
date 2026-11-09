import type {
  AccountInfo,
  IPublicClientApplication
} from "@azure/msal-browser";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { apiConfig } from "../authConfig";

export type CatalogProduct = {
  productId: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  active: boolean;
};

type CatalogResponse = {
  items: CatalogProduct[];
};

export type CreateCatalogProductPayload = {
  productId: string;
  name: string;
  description: string;
  price: number;
  stock: number;
};

type CreateCatalogProductResponse = {
  message: string;
  product: CatalogProduct;
};

export type UpdateCatalogProductPayload = {
  name: string;
  description: string;
  price: number;
  stock: number;
};

type UpdateCatalogProductResponse = {
  message: string;
  product: CatalogProduct;
};

type DeleteCatalogProductResponse = {
  message: string;
  product: CatalogProduct;
};

export type OrderStatus =
  | "CREADO"
  | "ACEPTADO"
  | "EN_PREPARACION"
  | "DESPACHADO"
  | "ENTREGADO"
  | "CANCELADO";

export type OrderItem = {
  productId: string;
  quantity: number;
};

export type CreateOrderItem = {
  productId: string;
  quantity: number;
};

export type CreateOrderPayload = {
  items: CreateOrderItem[];
};

export type Order = {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
};

type OrdersResponse = {
  items: Order[];
};

type UpdateOrderStatusResponse = {
  message: string;
  order: Order;
};

async function getAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<string> {
  try {
    const tokenResponse = await instance.acquireTokenSilent({
      account,
      scopes: apiConfig.scopes
    });

    return tokenResponse.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect({
        account,
        scopes: apiConfig.scopes
      });
    }

    throw error;
  }
}

export async function getCatalog(
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<CatalogProduct[]> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(`${apiConfig.baseUrl}/catalog`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo obtener el catálogo (${response.status}).`
    );
  }

  const data = (await response.json()) as CatalogResponse;

  return data.items;
}

export async function getOrders(
  instance: IPublicClientApplication,
  account: AccountInfo
): Promise<Order[]> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(`${apiConfig.baseUrl}/orders`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `No se pudieron obtener los pedidos (${response.status}).`
    );
  }

  const data = (await response.json()) as OrdersResponse;

  return data.items;
}

export async function createOrder(
  instance: IPublicClientApplication,
  account: AccountInfo,
  payload: CreateOrderPayload
): Promise<Order> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(`${apiConfig.baseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawResponse = await response.text();

  if (!response.ok) {
    throw new Error(
      `No se pudo crear el pedido (${response.status}): ${rawResponse}`
    );
  }

  let data: unknown;

  try {
    data = JSON.parse(rawResponse);
  } catch {
    throw new Error(
      `La API respondió correctamente, pero no devolvió JSON válido: ${rawResponse}`
    );
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("order" in data) ||
    typeof data.order !== "object" ||
    data.order === null ||
    !("orderId" in data.order) ||
    typeof data.order.orderId !== "string"
  ) {
    throw new Error(
      `La API creó el pedido, pero la respuesta no tiene el formato esperado: ${rawResponse}`
    );
  }

  return data.order as Order;
}

export async function updateOrderStatus(
  instance: IPublicClientApplication,
  account: AccountInfo,
  orderId: string,
  status: OrderStatus
): Promise<Order> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(
    `${apiConfig.baseUrl}/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status })
    }
  );

  const rawResponse = await response.text();

  if (!response.ok) {
    let message = rawResponse;

    try {
      const errorData = JSON.parse(rawResponse) as {
        message?: string;
      };

      message = errorData.message ?? rawResponse;
    } catch {
      // La respuesta de error puede no ser JSON.
    }

    throw new Error(
      `No se pudo cambiar el estado (${response.status}): ${message}`
    );
  }

  let data: UpdateOrderStatusResponse;

  try {
    data = JSON.parse(rawResponse) as UpdateOrderStatusResponse;
  } catch {
    throw new Error(
      "La API cambió el estado, pero no devolvió JSON válido."
    );
  }

  if (
    !data.order ||
    data.order.orderId !== orderId ||
    data.order.status !== status
  ) {
    throw new Error(
      "La API no confirmó el nuevo estado del pedido."
    );
  }

  return data.order;
}

export async function createCatalogProduct(
  instance: IPublicClientApplication,
  account: AccountInfo,
  payload: CreateCatalogProductPayload
): Promise<CatalogProduct> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(`${apiConfig.baseUrl}/catalog`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawResponse = await response.text();

  if (!response.ok) {
    let message = rawResponse;

    try {
      const errorData = JSON.parse(rawResponse) as {
        message?: string;
      };

      message = errorData.message ?? rawResponse;
    } catch {
      // La respuesta de error puede no ser JSON.
    }

    throw new Error(
      `No se pudo crear el producto (${response.status}): ${message}`
    );
  }

  let data: CreateCatalogProductResponse;

  try {
    data = JSON.parse(rawResponse) as CreateCatalogProductResponse;
  } catch {
    throw new Error(
      "La API respondió correctamente, pero no devolvió JSON válido."
    );
  }

  if (!data.product || typeof data.product.productId !== "string") {
    throw new Error(
      "La API respondió correctamente, pero no devolvió el producto creado."
    );
  }

  return data.product;
}

export async function updateProduct(
  instance: IPublicClientApplication,
  account: AccountInfo,
  productId: string,
  payload: UpdateCatalogProductPayload
): Promise<CatalogProduct> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(
    `${apiConfig.baseUrl}/catalog/${encodeURIComponent(productId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const rawResponse = await response.text();

  if (!response.ok) {
    let message = rawResponse;

    try {
      const errorData = JSON.parse(rawResponse) as {
        message?: string;
        error?: string;
      };

      message = errorData.message ?? errorData.error ?? rawResponse;
    } catch {
      // La respuesta de error puede no ser JSON.
    }

    throw new Error(
      `No se pudo actualizar el producto (${response.status}): ${message}`
    );
  }

  let data: UpdateCatalogProductResponse;

  try {
    data = JSON.parse(rawResponse) as UpdateCatalogProductResponse;
  } catch {
    throw new Error(
      "La API respondió correctamente, pero no devolvió JSON válido."
    );
  }

  if (!data.product || typeof data.product.productId !== "string") {
    throw new Error(
      "La API respondió correctamente, pero no devolvió el producto actualizado."
    );
  }

  return data.product;
}

export async function deleteProduct(
  instance: IPublicClientApplication,
  account: AccountInfo,
  productId: string
): Promise<CatalogProduct> {
  const accessToken = await getAccessToken(instance, account);

  const response = await fetch(
    `${apiConfig.baseUrl}/catalog/${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const rawResponse = await response.text();

  if (!response.ok) {
    let message = rawResponse;

    try {
      const errorData = JSON.parse(rawResponse) as {
        message?: string;
        error?: string;
      };

      message = errorData.message ?? errorData.error ?? rawResponse;
    } catch {
      // La respuesta de error puede no ser JSON.
    }

    throw new Error(
      `No se pudo desactivar el producto (${response.status}): ${message}`
    );
  }

  let data: DeleteCatalogProductResponse;

  try {
    data = JSON.parse(rawResponse) as DeleteCatalogProductResponse;
  } catch {
    throw new Error(
      "La API respondió correctamente, pero no devolvió JSON válido."
    );
  }

  if (
    !data.product ||
    data.product.productId !== productId ||
    data.product.active !== false
  ) {
    throw new Error(
      "La API respondió correctamente, pero no confirmó la desactivación del producto."
    );
  }

  return data.product;
}