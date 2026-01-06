"use client";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(18, 20, 24, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  zIndex: 1000
};

const modalStyle = {
  width: "min(880px, 100%)",
  background: "#ffffff",
  borderRadius: "16px",
  border: "1px solid rgba(34, 37, 43, 0.1)",
  boxShadow: "0 18px 40px rgba(20, 24, 36, 0.2)",
  padding: "24px",
  display: "grid",
  gap: "16px"
};

export default function CsvImportPreviewModal({
  rows,
  categories,
  bulkCategory,
  onBulkCategoryChange,
  onRowsChange,
  onManageCategories,
  onClose,
  onConfirm,
  isImporting,
  importError,
  hasAccount,
  accountName
}) {
  const hasMissingCategory = rows.some(
    (row) => !row.category || !row.category.trim()
  );
  const confirmDisabled =
    isImporting || rows.length === 0 || hasMissingCategory || !hasAccount;

  const handleRowCategoryChange = (index, nextCategory) => {
    onRowsChange((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], category: nextCategory };
      return next;
    });
  };

  const applyBulkCategory = () => {
    if (!bulkCategory) {
      return;
    }
    onRowsChange((prev) =>
      prev.map((row) => ({
        ...row,
        category: bulkCategory
      }))
    );
  };

  const handleRemoveRow = (rowId) => {
    if (!window.confirm("Remove this row from the import?")) {
      return;
    }
    onRowsChange((prev) => prev.filter((row) => row.id !== rowId));
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: 0 }}>Preview CSV import</h3>
            <p style={{ margin: "4px 0 0", color: "#555" }}>
              {rows.length} expenses ready to review.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <label style={{ display: "grid", gap: "6px" }}>
            Bulk assign category
            <select
              value={bulkCategory}
              onChange={(event) => onBulkCategoryChange(event.target.value)}
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={applyBulkCategory}>
            Apply to all rows
          </button>
        </div>
        <div>
          <button type="button" onClick={onManageCategories}>
            Add/manage categories
          </button>
        </div>

        {hasMissingCategory ? (
          <p style={{ color: "crimson", margin: 0 }}>
            Every row needs a category before import.
          </p>
        ) : null}
        {!hasAccount ? (
          <p style={{ color: "crimson", margin: 0 }}>
            Select an account before importing expenses.
          </p>
        ) : null}

        <div style={{ maxHeight: "50vh", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Date</th>
                <th align="left">Description</th>
                <th align="right">Amount</th>
                <th align="left">Category</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const missingCategory =
                  !row.category || !row.category.trim();
                return (
                  <tr
                    key={row.id}
                    style={
                      missingCategory
                        ? { background: "rgba(220, 20, 60, 0.08)" }
                        : undefined
                    }
                  >
                    <td>{row.date}</td>
                    <td>{row.description}</td>
                    <td align="right">{row.amount}</td>
                    <td>
                      <select
                        value={row.category}
                        onChange={(event) =>
                          handleRowCategoryChange(index, event.target.value)
                        }
                        aria-invalid={missingCategory}
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.name}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      {missingCategory ? (
                        <div style={{ color: "crimson", fontSize: "12px" }}>
                          Category required
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                      >
                        Remove row
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {importError ? (
          <p style={{ color: "crimson", margin: 0 }}>{importError}</p>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px"
          }}
        >
          <span style={{ color: "#555" }}>
            {accountName ? `Importing to ${accountName}` : "Account required"}
          </span>
          <button type="button" onClick={onClose}>
            Done reviewing
          </button>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled}>
            {isImporting ? "Importing..." : "Import expenses"}
          </button>
        </div>
      </div>
    </div>
  );
}
