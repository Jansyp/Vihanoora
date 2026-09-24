import { validateCheckoutForm } from "./checkoutValidation";

const validForm = {
  name: "Jansy",
  mobile: "9876543210",
  email: "jane@example.com",
  address: "1 Test Street",
  city: "Mumbai",
  state: "Maharashtra",
  pin: "400001",
};

describe("validateCheckoutForm", () => {
  test("reports the missing fields shown in the checkout screenshot", () => {
    expect(validateCheckoutForm({ ...validForm, address: "", city: "", state: "", pin: "" })).toEqual({
      address: "Address is required.",
      city: "City is required.",
      state: "State is required.",
      pin: "PIN Code is required.",
    });
  });

  test("reports missing name, mobile, and email fields", () => {
    expect(validateCheckoutForm({ ...validForm, name: "", mobile: "", email: "" })).toEqual({
      name: "Full Name is required.",
      mobile: "Mobile number is required.",
      email: "Email is required.",
    });
  });

  test("reports invalid mobile, email, and PIN formats", () => {
    expect(validateCheckoutForm({ ...validForm, mobile: "123", email: "invalid", pin: "1234" })).toEqual({
      mobile: "Enter a valid 10-digit mobile number.",
      email: "Enter a valid email address.",
      pin: "Enter a valid 6-digit PIN Code.",
    });
  });

  test("accepts a complete valid form", () => {
    expect(validateCheckoutForm(validForm)).toEqual({});
  });
});