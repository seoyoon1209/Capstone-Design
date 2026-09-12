import { Routes, Route } from "react-router-dom";
import Bottom from "./bottom.jsx"

import Main from "src/componts/main/main";
import User from "src/componts/user/user";
import Login from "./login";
import Membership from "src/componts/user/membership.jsx";
import Basic from "src/componts/user/basic.jsx";
import Bogunso from "src/componts/bogunso/Bogunso.jsx";
import Recovery from "src/componts/health/recovery.jsx";
import HeartRate from "src/componts/health/HeartRate.jsx";
import Correction from "src/componts/user/correction.jsx";
import Supporter from "src/componts/user/supporter.jsx";
import Day from "src/componts/nosmoking/day.jsx"
import FindId from "src/view/login_membership/findId.jsx";
import FindPw from "src/view/login_membership/findPw.jsx";
import Consulting from "src/componts/Consulting/consulting.jsx";
import NotFound from "src/view/NotFound";


function App() {
    return (
        <Routes>

            <Route path="/" element={<Main />} />
            <Route path="/login" element={<Login />} />

            <Route element={<Bottom />}>
                {/*<Route path="/" element={<Navigate to="/day" replace />} />*/}
                <Route path="/bogunso" element={<Bogunso />} />
                <Route path="/recovery" element={<Recovery />} />
                <Route path="/heartrate" element={<HeartRate />} />
                <Route path="/day" element={<Day />} />
                <Route path="/consulting" element={<Consulting />} />

                <Route path="/user">
                    <Route index element={<User />} />
                    <Route path="correction" element={<Correction />} />
                    <Route path="basic" element= {<Basic/>} />
                    <Route path="supporter" element={<Supporter />} />
                </Route>

            </Route>

            <Route path="membership" element={<Membership />} />

            <Route path="/find-id" element={<FindId />} />
            <Route path="/find-pw" element={<FindPw />} />

            {/* 404 Not Found */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}

export default App;
