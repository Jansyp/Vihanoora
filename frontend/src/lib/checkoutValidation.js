export function validateCheckoutForm(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Full Name is required.";
  if (!form.mobile.trim()) errors.mobile = "Mobile number is required.";
  else if (!/^\d{10}$/.test(form.mobile)) errors.mobile = "Enter a valid 10-digit mobile number.";
  if (!form.email.trim()) errors.email = "Email is required.";
  else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "Enter a valid email address.";
  if (!form.address.trim()) errors.address = "Address is required.";
  if (!form.city.trim()) errors.city = "City is required.";
  if (!form.state.trim()) errors.state = "State is required.";
  if (!form.pin.trim()) errors.pin = "PIN Code is required.";
  else if (!/^\d{6}$/.test(form.pin)) errors.pin = "Enter a valid 6-digit PIN Code.";
  return errors;
}
