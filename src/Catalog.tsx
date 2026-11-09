import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMsal } from "@azure/msal-react";
import { useRoles } from "./useRoles";
import {
  createCatalogProduct,
  deleteProduct,
  getCatalog,
  updateProduct,
  type CatalogProduct,
  type CreateCatalogProductPayload,
  type UpdateCatalogProductPayload
} from "./api/catalogApi";
import "./Catalog.css";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

// ---------------------------------------------------------------------------
// SUBCOMPONENTE 1: TARJETA DE PRODUCTO
// ---------------------------------------------------------------------------
interface ProductCardProps {
  product: CatalogProduct;
  viewMode: "grid" | "list";
  canEdit: boolean;
  onEdit: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
  deleting: boolean;
}

export function ProductCardComponent({
  product,
  viewMode,
  canEdit,
  onEdit,
  onDelete,
  deleting
}: ProductCardProps) {
  let stockClass = "badge-available";
  let stockText = `Stock: ${product.stock} u.`;

  if (product.stock === 0) {
    stockClass = "badge-out";
    stockText = "Agotado";
  } else if (product.stock <= 5) {
    stockClass = "badge-critical";
    stockText = `Stock crítico (${product.stock})`;
  }

  return (
    <article
      className={`product-card ${
        viewMode === "list" ? "card-list-mode" : ""
      }`}
    >
      <div>
        <div className="product-card-header">
          <h3>{product.name}</h3>

          <span className={`stock-badge ${stockClass}`}>
            {stockText}
          </span>
        </div>

        <p className="product-description">
          {product.description}
        </p>

        <p className="product-price">
          {clp.format(product.price)}
        </p>

        <p className="product-description">
          Código: {product.productId}
        </p>
      </div>

      {canEdit && (
        <div className="card-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onEdit(product)}
            disabled={deleting}
          >
            ✏️ Editar
          </button>

          <button
            type="button"
            className="btn-warning"
            onClick={() => onDelete(product)}
            disabled={deleting}
          >
            {deleting
              ? "Desactivando…"
              : "🗑️ Eliminar"}
          </button>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// SUBCOMPONENTE 2: FORMULARIO DE CREACIÓN Y EDICIÓN
// ---------------------------------------------------------------------------
interface ProductFormProps {
  initialProduct?: CatalogProduct | null;
  onSave: (
    productId: string,
    product: UpdateCatalogProductPayload
  ) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export function ProductFormComponent({
  initialProduct,
  onSave,
  onCancel,
  saving
}: ProductFormProps) {
  const [productId, setProductId] = useState(
    initialProduct?.productId ?? ""
  );

  const [name, setName] = useState(
    initialProduct?.name ?? ""
  );

  const [description, setDescription] = useState(
    initialProduct?.description ?? ""
  );

  const [price, setPrice] = useState<number | "">(
    initialProduct?.price ?? ""
  );

  const [stock, setStock] = useState<number | "">(
    initialProduct?.stock ?? ""
  );

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (price === "" || stock === "") {
      return;
    }

    void onSave(productId.trim(), {
      name: name.trim(),
      description: description.trim(),
      price,
      stock
    });
  };

  return (
    <form
      className="product-form"
      onSubmit={handleSubmit}
    >
      <h2>
        {initialProduct
          ? "Editar producto"
          : "Nuevo producto"}
      </h2>

      <div className="form-group">
        <label htmlFor="prod-id">
          Código del producto
        </label>

        <input
          id="prod-id"
          type="text"
          value={productId}
          onChange={(event) =>
            setProductId(event.target.value)
          }
          placeholder="Ejemplo: E023"
          required
          disabled={saving || Boolean(initialProduct)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="prod-name">
          Nombre del producto
        </label>

        <input
          id="prod-name"
          type="text"
          value={name}
          onChange={(event) =>
            setName(event.target.value)
          }
          required
          disabled={saving}
        />
      </div>

      <div className="form-group">
        <label htmlFor="prod-desc">
          Descripción
        </label>

        <textarea
          id="prod-desc"
          value={description}
          onChange={(event) =>
            setDescription(event.target.value)
          }
          required
          disabled={saving}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="prod-price">
            Precio (CLP)
          </label>

          <input
            id="prod-price"
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={(event) =>
              setPrice(
                event.target.value === ""
                  ? ""
                  : Number(event.target.value)
              )
            }
            required
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label htmlFor="prod-stock">
            Stock disponible
          </label>

          <input
            id="prod-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(event) =>
              setStock(
                event.target.value === ""
                  ? ""
                  : Number(event.target.value)
              )
            }
            required
            disabled={saving}
          />
        </div>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={saving}
        >
          {saving
            ? "Guardando…"
            : initialProduct
              ? "Guardar cambios"
              : "Crear producto"}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPAL: CATÁLOGO
// ---------------------------------------------------------------------------
export function Catalog() {
  const { instance, accounts } = useMsal();

  const {
    roles,
    loading: rolesLoading
  } = useRoles();

  const isAdmin = roles.includes("admin");

  const [products, setProducts] =
    useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [viewMode, setViewMode] =
    useState<"grid" | "list">("grid");

  const [isFormOpen, setIsFormOpen] =
    useState(false);

  const [editingProduct, setEditingProduct] =
    useState<CatalogProduct | null>(null);

  useEffect(() => {
    const account =
      instance.getActiveAccount() ??
      accounts[0];

    if (!account) {
      setError("No hay una sesión activa.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    getCatalog(instance, account)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setProducts(
          items.filter(
            (product) => product.active
          )
        );
      })
      .catch((err: unknown) => {
        console.error(err);

        if (!cancelled) {
          setError(
            "No se pudo cargar el catálogo. Verifica la sesión y la conexión con la API."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, instance]);

  const handleSaveProduct = async (
    productId: string,
    productData: UpdateCatalogProductPayload
  ) => {
    const account =
      instance.getActiveAccount() ??
      accounts[0];

    if (!account) {
      setError("No hay una sesión activa.");
      return;
    }

    if (!isAdmin) {
      setError(
        "Solo Admin puede gestionar productos."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingProduct) {
        const updated = await updateProduct(
          instance,
          account,
          editingProduct.productId,
          productData
        );

        setProducts((current) =>
          current.map((product) =>
            product.productId ===
            updated.productId
              ? updated
              : product
          )
        );

        setSuccess(
          `Producto ${updated.productId} actualizado correctamente.`
        );
      } else {
        const payload: CreateCatalogProductPayload = {
          productId,
          ...productData
        };

        const created =
          await createCatalogProduct(
            instance,
            account,
            payload
          );

        setProducts((current) =>
          [...current, created].sort(
            (a, b) =>
              a.productId.localeCompare(
                b.productId
              )
          )
        );

        setSuccess(
          `Producto ${created.productId} creado correctamente.`
        );
      }

      setIsFormOpen(false);
      setEditingProduct(null);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el producto."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (
    product: CatalogProduct
  ) => {
    if (!isAdmin || deletingProductId !== null) {
      return;
    }

    const confirmed = window.confirm(
      `¿Desactivar "${product.name}" (${product.productId})? ` +
        "Dejará de aparecer en el catálogo."
    );

    if (!confirmed) {
      return;
    }

    const account =
      instance.getActiveAccount() ??
      accounts[0];

    if (!account) {
      setError("No hay una sesión activa.");
      return;
    }

    setDeletingProductId(
      product.productId
    );
    setError("");
    setSuccess("");

    try {
      await deleteProduct(
        instance,
        account,
        product.productId
      );

      setProducts((current) =>
        current.filter(
          (item) =>
            item.productId !==
            product.productId
        )
      );

      setSuccess(
        `Producto ${product.productId} desactivado correctamente.`
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo desactivar el producto."
      );
    } finally {
      setDeletingProductId(null);
    }
  };

  if (loading || rolesLoading) {
    return (
      <p className="loading-state">
        Cargando catálogo…
      </p>
    );
  }

  if (error && products.length === 0) {
    return (
      <p
        role="alert"
        className="alert-error"
      >
        {error}
      </p>
    );
  }

  return (
    <section className="catalog-container">
      <div className="catalog-header">
        <div>
          <h1>Catálogo de productos</h1>

          <p>
            Productos electrónicos de Pedidos360.
          </p>
        </div>

        <div className="catalog-controls">
          {isAdmin && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingProduct(null);
                setError("");
                setSuccess("");
                setIsFormOpen(true);
              }}
            >
              ➕ Crear producto
            </button>
          )}

          <div className="view-toggle">
            <button
              type="button"
              className={
                viewMode === "grid"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setViewMode("grid")
              }
            >
              田 Grid
            </button>

            <button
              type="button"
              className={
                viewMode === "list"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setViewMode("list")
              }
            >
              ☰ Lista
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="alert-error"
        >
          {error}
        </p>
      )}

      {success && (
        <p role="status">
          {success}
        </p>
      )}

      {isFormOpen && isAdmin && (
        <div className="form-modal-backdrop">
          <ProductFormComponent
            key={
              editingProduct?.productId ??
              "new-product"
            }
            initialProduct={editingProduct}
            onSave={handleSaveProduct}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingProduct(null);
            }}
            saving={saving}
          />
        </div>
      )}

      <div
        className={
          viewMode === "grid"
            ? "catalog-grid"
            : "catalog-list"
        }
      >
        {products.map((product) => (
          <ProductCardComponent
            key={product.productId}
            product={product}
            viewMode={viewMode}
            canEdit={isAdmin}
            onEdit={(selectedProduct) => {
              setEditingProduct(
                selectedProduct
              );
              setError("");
              setSuccess("");
              setIsFormOpen(true);
            }}
            onDelete={handleDeleteProduct}
            deleting={
              deletingProductId ===
              product.productId
            }
          />
        ))}
      </div>
    </section>
  );
}

export default Catalog;