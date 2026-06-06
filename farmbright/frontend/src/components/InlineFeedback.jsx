import React from "react";

const feedbackClass = {
  error: "alert alert-error",
  info: "alert alert-info",
  success: "alert alert-success",
  warning: "alert alert-warning",
};

function InlineFeedback({ message, type = "info" }) {
  if (!message) return null;

  return (
    <div className={`${feedbackClass[type] || feedbackClass.info} my-2 rounded-md text-sm`} role={type === "error" ? "alert" : "status"}>
      <span>{message}</span>
    </div>
  );
}

export default InlineFeedback;
