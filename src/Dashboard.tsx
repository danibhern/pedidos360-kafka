import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { getOrders, type Order, type OrderStatus } from "./api/catalogApi";
import { useRoles } from "./useRoles";
import "./Dashboard.css";

const STATUS_LABELS: Record<
  OrderStatus,
  { text: string; badgeClass: string }
> = {
  CREADO: { text: "Creado (pendiente)", badgeClass: "badge-warning" },
  ACEPTADO: { text: "Aceptado", badgeClass: "badge-info" },
  EN_PREPARACION: { text: "En preparación", badgeClass: "badge-info" },
  DESPACHADO: { text: "Despachado", badgeClass: "badge-primary" },
  ENTREGADO: { text: "Entregado", badgeClass: "badge-success" },
  CANCELADO: { text: "Cancelado", badgeClass: "badge-danger" }
};

const ORDER_STEPS: OrderStatus[] = [
  "CREADO",
  "ACEPTADO",
  "EN_PREPARACION",
  "DESPACHADO",
  "ENTREGADO"
];

const ACTIVE_STATUSES: OrderStatus[] = [
  "ACEPTADO",
  "EN_PREPARACION",
  "DESPACHADO"
];

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formattedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : dateTimeFormatter.format(date);
}

function orderCode(order: Order): string {
  return `#${order.orderId.slice(0, 8)}`;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const info = STATUS_LABELS[status];

  return (
    <span className={`badge ${info?.badgeClass ?? "badge-info"}`}>
      {info?.text ?? status}
    </span>
  );
}

function AdminDashboardView({ orders }: { orders: Order[] }) {
  const pending = orders.filter((order) => order.status === "CREADO").length;
  const inProgress = orders.filter((order) =>
    ACTIVE_STATUSES.includes(order.status)
  ).length;
  const delivered = orders.filter(
    (order) => order.status === "ENTREGADO"
  ).length;

  return (
    <div className="dashboard-content">
      <div className="kpi-grid">
        <div className="kpi-card highlight">
          <span className="kpi-title">Pedidos registrados</span>
          <span className="kpi-value">{orders.length}</span>
        </div>
        <div className="kpi-card highlight-orange">
          <span className="kpi-title">Pendientes</span>
          <span className="kpi-value">{pending}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">En curso</span>
          <span className="kpi-value">{inProgress}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-title">Entregados</span>
          <span className="kpi-value">{delivered}</span>
        </div>
      </div>

      <div className="dashboard-section" style={{ marginTop: 24 }}>
        <h3>Más indicadores</h3>
        <p>
          Los reportes de ventas se consultan desde Reportes con perfil Admin.
          Esta API no proporciona una métrica de usuarios activos.
          No se muestran cifras simuladas en este panel.
        </p>
      </div>

      <div className="dashboard-section" style={{ marginTop: 24 }}>
        <h3>Pedidos recientes</h3>
        {orders.length === 0 ? (
          <p>Aún no hay pedidos registrados.</p>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).map((order) => (
                <tr key={order.orderId}>
                  <td>{orderCode(order)}</td>
                  <td>{formattedDate(order.createdAt)}</td>
                  <td><StatusBadge status={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p><Link to="/orders">Ver todos los pedidos</Link></p>
      </div>
    </div>
  );
}

function OperatorDashboardView({ orders }: { orders: Order[] }) {
  const pending = orders.filter((order) => order.status === "CREADO");
  const inProgress = orders.filter((order) =>
    ACTIVE_STATUSES.includes(order.status)
  );
  const queue = [...pending, ...inProgress].slice(0, 8);

  return (
    <div className="dashboard-content">
      <div className="kpi-grid">
        <div className="kpi-card highlight-orange">
          <span className="kpi-title">Pedidos pendientes (creados)</span>
          <span className="kpi-value">{pending.length}</span>
        </div>
        <div className="kpi-card highlight">
          <span className="kpi-title">Pedidos en curso</span>
          <span className="kpi-value">{inProgress.length}</span>
        </div>
      </div>

      <div className="dashboard-section" style={{ marginTop: 24 }}>
        <h3>Cola de pedidos por gestionar</h3>
        {queue.length === 0 ? (
          <p>No hay pedidos pendientes ni en curso.</p>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Productos</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((order) => (
                <tr key={order.orderId}>
                  <td><strong>{orderCode(order)}</strong></td>
                  <td>{formattedDate(order.createdAt)}</td>
                  <td>{order.items.length}</td>
                  <td><StatusBadge status={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p><Link to="/orders">Gestionar pedidos</Link></p>
      </div>
    </div>
  );
}

function CustomerDashboardView({ orders }: { orders: Order[] }) {
  const latest = orders.slice(0, 5);
  const active = orders.find(
    (order) =>
      order.status !== "ENTREGADO" && order.status !== "CANCELADO"
  );
  const currentStep = active ? ORDER_STEPS.indexOf(active.status) : -1;
  const onTheWay = orders.filter(
    (order) => order.status === "DESPACHADO"
  ).length;

  return (
    <div className="dashboard-content">
      <div className="dashboard-header-row">
        <h2>Mi panel de pedidos</h2>
        <Link to="/orders">Ver mis pedidos</Link>
      </div>

      <div className="kpi-grid" style={{ marginTop: 16, marginBottom: 24 }}>
        <div className="kpi-card">
          <span className="kpi-title">Mis pedidos</span>
          <span className="kpi-value">{orders.length}</span>
        </div>
        <div className="kpi-card border-accent">
          <span className="kpi-title">Pedidos despachados</span>
          <span className="kpi-value">{onTheWay}</span>
        </div>
      </div>

      <div className="dashboard-section" style={{ marginBottom: 24 }}>
        {active ? (
          <>
            <h3>Seguimiento del pedido {orderCode(active)}</h3>
            <p className="subtitle">
              Creado: {formattedDate(active.createdAt)} · Estado actual:{" "}
              <StatusBadge status={active.status} />
            </p>
            <div className="stepper-container">
              {ORDER_STEPS.map((step, index) => (
                <div
                  key={step}
                  className={`stepper-step ${
                    index <= currentStep ? "step-completed" : ""
                  }`}
                >
                  <div className="step-number">{index + 1}</div>
                  <span className="step-label">{STATUS_LABELS[step].text}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h3>Seguimiento</h3>
            <p>No tienes pedidos activos en este momento.</p>
          </>
        )}
      </div>

      <div className="dashboard-section">
        <h3>Mis últimos pedidos</h3>
        {latest.length === 0 ? (
          <p>Aún no has creado pedidos.</p>
        ) : (
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((order) => (
                <tr key={order.orderId}>
                  <td><strong>{orderCode(order)}</strong></td>
                  <td>{formattedDate(order.createdAt)}</td>
                  <td><StatusBadge status={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { instance, accounts } = useMsal();
  const { roles, loading: rolesLoading } = useRoles();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = roles.includes("admin");
  const isOperator = roles.includes("operador");
  const isCustomer = roles.includes("cliente");
  const currentUser = instance.getActiveAccount() ?? accounts[0];

  useEffect(() => {
    if (rolesLoading) {
      return;
    }

    if (!isAdmin && !isOperator && !isCustomer) {
      setOrdersLoading(false);
      return;
    }

    const account = instance.getActiveAccount() ?? accounts[0];

    if (!account) {
      setError("No hay una sesión activa.");
      setOrdersLoading(false);
      return;
    }

    let cancelled = false;
    setOrdersLoading(true);
    setError("");

    getOrders(instance, account)
      .then((loadedOrders) => {
        if (!cancelled) {
          setOrders(
            [...loadedOrders].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt)
            )
          );
        }
      })
      .catch((reason: unknown) => {
        console.error(reason);
        if (!cancelled) {
          setError("No se pudieron cargar los pedidos del Dashboard.");
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
  }, [accounts, instance, rolesLoading, isAdmin, isOperator, isCustomer]);

  if (rolesLoading || ordersLoading) {
    return <p className="loading-state">Cargando actividad…</p>;
  }

  if (!isAdmin && !isOperator && !isCustomer) {
    return <p role="alert">No se reconoció un rol autorizado.</p>;
  }

  return (
    <div className="dashboard-container">
      <div className="welcome-banner">
        <div className="welcome-avatar">
          {(currentUser?.name ?? currentUser?.username ?? "U")
            .charAt(0)
            .toUpperCase()}
        </div>
        <div className="welcome-info">
          <h3>
            ¡Bienvenido/a, {currentUser?.name ?? currentUser?.username ?? "usuario"}!
          </h3>
          <p>
            {currentUser?.username ?? "Sesión iniciada"} · Rol activo:{" "}
            <span className="role-highlight">
              {isAdmin ? "Administrador" : isOperator ? "Operador" : "Cliente"}
            </span>
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert">{error}</p>
      ) : isAdmin ? (
        <AdminDashboardView orders={orders} />
      ) : isOperator ? (
        <OperatorDashboardView orders={orders} />
      ) : (
        <CustomerDashboardView orders={orders} />
      )}
    </div>
  );
}

export default Dashboard;
