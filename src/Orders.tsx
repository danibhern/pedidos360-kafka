import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useRoles } from "./useRoles";
import "./Orders-operador-estilo.css";
import {
  createOrder,
  getCatalog,
  getOrders,
  updateOrderStatus,
  type CatalogProduct,
  type CreateOrderItem,
  type Order,
  type OrderStatus
} from "./api/catalogApi";

const statusLabel: Record<OrderStatus, string> = {
  CREADO: "Creado",
  ACEPTADO: "Aceptado",
  EN_PREPARACION: "En preparación",
  DESPACHADO: "Despachado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado"
};

const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  CREADO: ["ACEPTADO", "CANCELADO"],
  ACEPTADO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["DESPACHADO", "CANCELADO"],
  DESPACHADO: ["ENTREGADO"],
  ENTREGADO: [],
  CANCELADO: []
};

type OrderFilter = "todos" | "pendientes" | "en_curso" | "finalizados";

function matchesFilter(order: Order, filter: OrderFilter): boolean {
  switch (filter) {
    case "pendientes":
      return order.status === "CREADO";
    case "en_curso":
      return ["ACEPTADO", "EN_PREPARACION", "DESPACHADO"].includes(
        order.status
      );
    case "finalizados":
      return ["ENTREGADO", "CANCELADO"].includes(order.status);
    default:
      return true;
  }
}

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

export function Orders() {
  const { instance, accounts } = useMsal();
  const { roles, loading: rolesLoading } = useRoles();

  const isCliente = roles.includes("cliente");
  const canCreate = isCliente;
  const canManage = roles.includes("operador") || roles.includes("admin");

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [items, setItems] = useState<CreateOrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("pendientes");
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusSuccess, setStatusSuccess] = useState("");

  useEffect(() => {
    const account = instance.getActiveAccount() ?? accounts[0];

    if (!account) {
      setOrdersError("No hay una sesión activa.");
      setOrdersLoading(false);
      return;
    }

    let cancelled = false;
    setOrdersLoading(true);

    getOrders(instance, account)
      .then((loadedOrders) => {
        if (!cancelled) {
          setOrders(loadedOrders);
          setOrdersError("");
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          setOrdersError("No se pudieron cargar los pedidos.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOrdersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, instance]);

  useEffect(() => {
    if (rolesLoading || !canCreate) {
      return;
    }

    const account = instance.getActiveAccount() ?? accounts[0];

    if (!account) {
      setCatalogError("No hay una sesión activa.");
      return;
    }

    let cancelled = false;
    setCatalogLoading(true);

    getCatalog(instance, account)
      .then((loadedProducts) => {
        if (!cancelled) {
          setProducts(
            loadedProducts.filter(
              (product) => product.active && product.stock > 0
            )
          );
          setCatalogError("");
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          setCatalogError("No se pudieron cargar los productos disponibles.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, canCreate, instance, rolesLoading]);

  const addItem = () => {
    setActionError("");
    setSuccess("");

    const product = products.find(
      (entry) => entry.productId === selectedProductId
    );

    if (!product) {
      setActionError("Selecciona un producto disponible.");
      return;
    }

    if (quantity === "" || !Number.isInteger(quantity) || quantity <= 0) {
      setActionError("La cantidad debe ser un entero mayor que cero.");
      return;
    }

    if (items.some((item) => item.productId === product.productId)) {
      setActionError("Ese producto ya está agregado al pedido.");
      return;
    }

    if (items.length >= 20) {
      setActionError("Puedes agregar hasta 20 productos por pedido.");
      return;
    }

    if (quantity > product.stock) {
      setActionError(
        `La cantidad supera el stock mostrado (${product.stock}).`
      );
      return;
    }

    setItems((current) => [
      ...current,
      { productId: product.productId, quantity }
    ]);
    setSelectedProductId("");
    setQuantity(1);
  };

  const handleCreateOrder = async () => {
    if (!canCreate || creating || items.length === 0) {
      return;
    }

    const account = instance.getActiveAccount() ?? accounts[0];

    if (!account) {
      setActionError("No hay una sesión activa.");
      return;
    }

    setCreating(true);
    setActionError("");
    setSuccess("");

    try {
      const created = await createOrder(instance, account, { items });
      setOrders((current) => [created, ...current]);
      setItems([]);
      setSuccess(
        `Pedido ${created.orderId.slice(0, 8)} creado correctamente.`
      );
    } catch (error) {
      console.error(error);
      setActionError(
        error instanceof Error ? error.message : "No se pudo crear el pedido."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (
    order: Order,
    nextStatus: OrderStatus
  ) => {
    if (
      !canManage ||
      updatingOrderId !== null ||
      !nextStatuses[order.status].includes(nextStatus)
    ) {
      return;
    }

    if (
      nextStatus === "CANCELADO" &&
      !window.confirm(
        `¿Cancelar el pedido #${order.orderId.slice(0, 8)}?`
      )
    ) {
      return;
    }

    const account = instance.getActiveAccount() ?? accounts[0];

    if (!account) {
      setStatusError("No hay una sesión activa.");
      return;
    }

    setUpdatingOrderId(order.orderId);
    setStatusError("");
    setStatusSuccess("");

    try {
      const updated = await updateOrderStatus(
        instance,
        account,
        order.orderId,
        nextStatus
      );

      setOrders((current) =>
        current.map((item) =>
          item.orderId === updated.orderId ? updated : item
        )
      );

      setStatusSuccess(
        `Pedido #${order.orderId.slice(0, 8)}: ${statusLabel[nextStatus]}.`
      );
    } catch (error) {
      console.error(error);
      setStatusError(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el estado."
      );
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const visibleOrders = canManage
    ? orders.filter((order) => matchesFilter(order, orderFilter))
    : orders;

  if (rolesLoading) {
    return <p className="loading-state">Cargando pedidos…</p>;
  }

  return (
    <section
      className={
        canManage ? "orders-page orders-page--manage" : "orders-page"
      }
    >
      <h1>{isCliente ? "Mis pedidos" : "Gestión de pedidos"}</h1>

      <p>
        {isCliente
          ? "Crea pedidos y consulta su estado."
          : "Revisa los pedidos y actualiza su estado según el flujo operativo."}
      </p>

      {canCreate && (
        <section className="card order-create-card">
          <h2>Crear pedido</h2>

          <p>
            Selecciona productos activos y agrégalos al pedido. El stock se
            descontará cuando el pedido sea aceptado.
          </p>

          {catalogLoading && <p>Cargando productos…</p>}
          {catalogError && <p role="alert">{catalogError}</p>}

          {!catalogLoading && !catalogError && products.length === 0 && (
            <p>No hay productos disponibles para pedir.</p>
          )}

          {!catalogLoading && !catalogError && products.length > 0 && (
            <div className="form-row order-item-form">
              <div className="form-group">
                <label htmlFor="order-product">Producto</label>

                <select
                  id="order-product"
                  value={selectedProductId}
                  onChange={(event) =>
                    setSelectedProductId(event.target.value)
                  }
                  disabled={creating}
                >
                  <option value="">Selecciona un producto</option>

                  {products.map((product) => (
                    <option
                      key={product.productId}
                      value={product.productId}
                    >
                      {product.name} ({product.productId}) —{" "}
                      {clp.format(product.price)} — stock: {product.stock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="order-quantity">Cantidad</label>

                <input
                  id="order-quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value)
                    )
                  }
                  disabled={creating}
                />
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={addItem}
                disabled={creating}
              >
                Agregar
              </button>
            </div>
          )}

          {items.length > 0 && (
            <>
              <h3>Productos del pedido</h3>

              <ul className="order-selected-items">
                {items.map((item) => {
                  const product = products.find(
                    (entry) => entry.productId === item.productId
                  );

                  return (
                    <li key={item.productId}>
                      <span>
                        {product?.name ?? item.productId} — cantidad:{" "}
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        className="btn-secondary order-remove-button"
                        onClick={() =>
                          setItems((current) =>
                            current.filter(
                              (entry) =>
                                entry.productId !== item.productId
                            )
                          )
                        }
                        disabled={creating}
                      >
                        Quitar
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {actionError && <p role="alert">{actionError}</p>}
          {success && <p role="status">{success}</p>}

          <button
            type="button"
            className="btn-primary order-create-submit"
            onClick={() => {
              void handleCreateOrder();
            }}
            disabled={creating || items.length === 0}
          >
            {creating ? "Creando pedido…" : "Confirmar pedido"}
          </button>
        </section>
      )}

      <h2>{isCliente ? "Historial de mis pedidos" : "Pedidos por gestionar"}</h2>

      {canManage && (
        <div className="form-group">
          <label htmlFor="orders-filter">Mostrar pedidos</label>
          <select
            id="orders-filter"
            value={orderFilter}
            onChange={(event) =>
              setOrderFilter(event.target.value as OrderFilter)
            }
          >
            <option value="pendientes">Pendientes (creados)</option>
            <option value="en_curso">En curso</option>
            <option value="finalizados">Finalizados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      )}

      {statusError && <p role="alert">{statusError}</p>}
      {statusSuccess && <p role="status">{statusSuccess}</p>}

      {ordersLoading ? (
        <p className="loading-state">Cargando pedidos…</p>
      ) : ordersError ? (
        <p role="alert">{ordersError}</p>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <p>Aún no hay pedidos registrados.</p>
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="empty-state">
          <p>No hay pedidos en esta categoría.</p>
        </div>
      ) : (
        <div className="orders-list">
          {visibleOrders.map((order) => (
            <article className="order-card" key={order.orderId}>
              <div className="order-card-header">
                <div>
                  <span className="order-id">
                    Pedido #{order.orderId.slice(0, 8)}
                  </span>

                  <p>
                    Creado:{" "}
                    {new Intl.DateTimeFormat("es-CL", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    }).format(new Date(order.createdAt))}
                  </p>
                </div>

                <span
                  className={`status-badge status-${order.status.toLowerCase()}`}
                >
                  {statusLabel[order.status] ?? order.status}
                </span>
              </div>

              <div className="order-items">
                <strong>Productos</strong>

                <ul>
                  {order.items.map((item) => (
                    <li key={`${order.orderId}-${item.productId}`}>
                      {item.productId} · Cantidad: {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>

              {canManage && nextStatuses[order.status].length > 0 && (
                <div className="order-actions">
                  {nextStatuses[order.status].map((nextStatus) => (
                    <button
                      key={nextStatus}
                      type="button"
                      className={
                        nextStatus === "CANCELADO"
                          ? "btn-secondary order-cancel-button"
                          : "btn-secondary order-next-button"
                      }
                      disabled={updatingOrderId !== null}
                      onClick={() => {
                        void handleUpdateStatus(order, nextStatus);
                      }}
                    >
                      {updatingOrderId === order.orderId
                        ? "Actualizando…"
                        : nextStatus === "CANCELADO"
                          ? "Cancelar pedido"
                          : `Marcar como ${statusLabel[nextStatus]}`}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}