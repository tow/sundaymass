// Shared email/password dialog behavior; stores remain responsible for authentication.
(function (global) {
  "use strict";

  function create({
    button,
    dialog,
    form,
    cancelButton,
    emailInput,
    passwordInput,
    submitButton,
    errorElement,
    getStore,
    isSignedIn,
    openDialog,
    scheduleFocus,
    onUnavailable = () => {},
    onActionFailure = () => {},
    logger = console,
  }) {
    let started = false;

    async function onAuthAction() {
      const store = getStore();
      if (!store) {
        onUnavailable();
        return;
      }
      try {
        if (isSignedIn()) {
          await store.signOut();
        } else {
          errorElement.textContent = "";
          openDialog(dialog);
          scheduleFocus(() => emailInput.focus());
        }
      } catch (error) {
        logger.error(error);
        onActionFailure(error);
      }
    }

    function closeDialog() {
      dialog.close();
    }

    function onDialogClick(event) {
      if (event.target === dialog) closeDialog();
    }

    async function onSubmit(event) {
      event.preventDefault();
      errorElement.textContent = "";
      const previousLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Signing in…";
      try {
        const store = getStore();
        if (!store) {
          onUnavailable();
          return;
        }
        await store.signIn(emailInput.value.trim(), passwordInput.value);
        passwordInput.value = "";
        closeDialog();
      } catch (error) {
        logger.error(error);
        errorElement.textContent = "Sign-in failed. Check the email and password.";
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = previousLabel;
      }
    }

    function start() {
      if (started) return;
      button.addEventListener("click", onAuthAction);
      cancelButton.addEventListener("click", closeDialog);
      dialog.addEventListener("click", onDialogClick);
      form.addEventListener("submit", onSubmit);
      started = true;
    }

    function stop() {
      if (!started) return;
      button.removeEventListener("click", onAuthAction);
      cancelButton.removeEventListener("click", closeDialog);
      dialog.removeEventListener("click", onDialogClick);
      form.removeEventListener("submit", onSubmit);
      started = false;
    }

    return Object.freeze({ start, stop });
  }

  const api = Object.freeze({ create });
  global.AuthController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
